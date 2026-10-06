import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBatchLoader } from './batchLoader';

const makeLoader = (
  options: { windowMs?: number; maxBatchSize?: number } = {},
) => {
  const load = vi.fn(async (ids: string[], _signal: AbortSignal) => {
    const items = new Map(ids.map((id) => [id, `item:${id}`]));
    return (id: string) => items.get(id);
  });
  return { load, loader: createBatchLoader({ load, ...options }) };
};

describe('createBatchLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('combines requests made within the window into one load', async () => {
    const { load, loader } = makeLoader({ windowMs: 20 });

    const results = Promise.all([loader('a'), loader('b'), loader('c')]);
    expect(load).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20);

    await expect(results).resolves.toEqual(['item:a', 'item:b', 'item:c']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toEqual(['a', 'b', 'c']);
  });

  it('starts a new batch for requests made after a flush', async () => {
    const { load, loader } = makeLoader({ windowMs: 20 });

    const first = loader('a');
    await vi.advanceTimersByTimeAsync(20);
    const second = loader('b');
    await vi.advanceTimersByTimeAsync(20);

    await expect(first).resolves.toBe('item:a');
    await expect(second).resolves.toBe('item:b');
    expect(load.mock.calls.map(([ids]) => ids)).toEqual([['a'], ['b']]);
  });

  it('does not dedupe without a key', async () => {
    const { load, loader } = makeLoader();

    const results = Promise.all([loader('a'), loader('a')]);
    await vi.runAllTimersAsync();

    await expect(results).resolves.toEqual(['item:a', 'item:a']);
    expect(load.mock.calls[0][0]).toEqual(['a', 'a']);
  });

  it('rejects without queuing anything when the key throws', async () => {
    const { load } = makeLoader();
    const loader = createBatchLoader({
      load,
      key: () => {
        throw new Error('bad key');
      },
    });

    await expect(loader('a')).rejects.toThrow('bad key');
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
  });

  it('uses a custom key for dedupe', async () => {
    const load = vi.fn(async (_reqs: { id: string; n: number }[]) => {
      return (req: { id: string }) => req.id;
    });
    const loader = createBatchLoader({ load, key: (req) => req.id });

    const results = Promise.all([
      loader({ id: 'a', n: 1 }),
      loader({ id: 'a', n: 2 }),
    ]);
    await vi.runAllTimersAsync();

    await expect(results).resolves.toEqual(['a', 'a']);
    expect(load.mock.calls[0][0]).toEqual([{ id: 'a', n: 1 }]);
  });

  it('flushes early and splits into chunks at maxBatchSize', async () => {
    const { load, loader } = makeLoader({ windowMs: 1000, maxBatchSize: 2 });

    const results = Promise.all(['a', 'b', 'c'].map((id) => loader(id)));
    await vi.advanceTimersByTimeAsync(0);
    expect(load.mock.calls.map(([ids]) => ids)).toEqual([['a', 'b']]);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(results).resolves.toEqual(['item:a', 'item:b', 'item:c']);
    expect(load.mock.calls.map(([ids]) => ids)).toEqual([['a', 'b'], ['c']]);
  });

  it('rejects only the caller whose pick throws', async () => {
    const loader = createBatchLoader({
      load: async () => (id: string) => {
        if (id === 'bad') throw new Error('bad item');
        return id;
      },
    });

    const ok = expect(loader('a')).resolves.toBe('a');
    const bad = expect(loader('bad')).rejects.toThrow('bad item');
    await vi.runAllTimersAsync();

    await ok;
    await bad;
  });

  it('rejects every caller when the load fails', async () => {
    const error = new Error('network down');
    const loader = createBatchLoader<string, string>({
      load: async () => {
        throw error;
      },
    });

    const results = Promise.allSettled([loader('a'), loader('a'), loader('b')]);
    await vi.runAllTimersAsync();

    expect(await results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const { load, loader } = makeLoader();
    const controller = new AbortController();
    controller.abort(new Error('gone'));

    await expect(loader('a', controller.signal)).rejects.toThrow('gone');
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
  });

  it('drops an aborted request before the batch is sent', async () => {
    const { load, loader } = makeLoader({ windowMs: 20 });
    const controller = new AbortController();

    const aborted = loader('a', controller.signal);
    const kept = loader('b');
    controller.abort(new Error('unmounted'));

    await expect(aborted).rejects.toThrow('unmounted');
    await vi.advanceTimersByTimeAsync(20);
    await expect(kept).resolves.toBe('item:b');
    expect(load.mock.calls[0][0]).toEqual(['b']);
  });

  it('skips the load entirely when every queued request aborts', async () => {
    const { load, loader } = makeLoader({ windowMs: 20 });
    const controller = new AbortController();

    const aborted = loader('a', controller.signal);
    controller.abort(new Error('unmounted'));

    await expect(aborted).rejects.toThrow('unmounted');
    await vi.advanceTimersByTimeAsync(20);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps an in-flight batch running while any caller is waiting', async () => {
    let batchSignal: AbortSignal | undefined;
    let finish: () => void = () => {};
    const loader = createBatchLoader<string, string>({
      load: (_ids, signal) => {
        batchSignal = signal;
        return new Promise((resolve) => {
          finish = () => resolve((id) => id);
        });
      },
    });
    const controller = new AbortController();

    const aborted = loader('a', controller.signal);
    const kept = loader('b');
    await vi.runAllTimersAsync();

    controller.abort(new Error('unmounted'));
    await expect(aborted).rejects.toThrow('unmounted');
    expect(batchSignal?.aborted).toBe(false);

    finish();
    await expect(kept).resolves.toBe('b');
  });

  it('aborts an in-flight batch once every caller has aborted', async () => {
    let batchSignal: AbortSignal | undefined;
    const loader = createBatchLoader<string, string>({
      load: (_ids, signal) => {
        batchSignal = signal;
        return new Promise(() => {});
      },
    });
    const first = new AbortController();
    const second = new AbortController();

    const a = loader('a', first.signal);
    const b = loader('b', second.signal);
    await vi.runAllTimersAsync();

    first.abort(new Error('one'));
    await expect(a).rejects.toThrow('one');
    expect(batchSignal?.aborted).toBe(false);

    second.abort(new Error('two'));
    await expect(b).rejects.toThrow('two');
    expect(batchSignal?.aborted).toBe(true);
  });
});
