export type BatchLoaderOptions<REQ, ITEM> = {
  /**
   * Load every queued request in one go. Resolves to a function that picks
   * the item for a single request out of the combined result; if it throws,
   * only that caller rejects.
   */
  load: (
    requests: REQ[],
    signal: AbortSignal,
  ) => Promise<(request: REQ) => ITEM>;
  /** Requests with the same key share one entry. Without it, nothing is deduped. */
  key?: (request: REQ) => unknown;
  /**
   * How long after the first queued request to flush. Defaults to `0`, which
   * flushes in a `setTimeout(0)` macrotask.
   */
  windowMs?: number;
  /** Flush as soon as this many unique requests are queued. */
  maxBatchSize?: number;
};

export type BatchLoader<REQ, ITEM> = (
  request: REQ,
  signal?: AbortSignal,
) => Promise<ITEM>;

type Waiter<ITEM> = {
  resolve: (item: ITEM) => void;
  reject: (error: unknown) => void;
};

type Entry<REQ, ITEM> = { request: REQ; waiters: Set<Waiter<ITEM>> };

type Batch<REQ, ITEM> = {
  entries: Map<unknown, Entry<REQ, ITEM>>;
  controller: AbortController;
  waiting: number;
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * Collect individual requests over a short window and resolve them with a
 * single `load` call, dataloader-style. Results are not cached — pair it with
 * a cache such as react-query.
 *
 * @example
 *   const loadThumbnail = createBatchLoader({
 *     windowMs: 20,
 *     load: async (fileIds: string[]) => {
 *       const { items } = await fetchThumbnails(fileIds);
 *       return (fileId) => {
 *         const item = items.find((t) => t.fileId === fileId);
 *         if (!item) throw new Error(`No thumbnail for ${fileId}`);
 *         return item;
 *       };
 *     },
 *   });
 *   await loadThumbnail('file-1');
 */
export const createBatchLoader = <REQ, ITEM>(
  options: BatchLoaderOptions<REQ, ITEM>,
): BatchLoader<REQ, ITEM> => {
  const {
    load,
    key,
    windowMs = 0,
    maxBatchSize = Number.POSITIVE_INFINITY,
  } = options;

  let pending: Batch<REQ, ITEM> | undefined;

  const settle = async (batch: Batch<REQ, ITEM>) => {
    const entries = Array.from(batch.entries.values());
    let pick: (request: REQ) => ITEM;
    try {
      pick = await load(
        entries.map((entry) => entry.request),
        batch.controller.signal,
      );
    } catch (error) {
      for (const entry of entries) {
        entry.waiters.forEach((waiter) => {
          waiter.reject(error);
        });
      }
      return;
    }

    for (const entry of entries) {
      try {
        const item = pick(entry.request);
        entry.waiters.forEach((waiter) => {
          waiter.resolve(item);
        });
      } catch (error) {
        entry.waiters.forEach((waiter) => {
          waiter.reject(error);
        });
      }
    }
  };

  const dispatch = (batch: Batch<REQ, ITEM>) => {
    clearTimeout(batch.timer);
    if (pending === batch) pending = undefined;
    void settle(batch);
  };

  return (request, signal) =>
    new Promise<ITEM>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }

      let entryKey: unknown;
      try {
        entryKey = key ? key(request) : Symbol();
      } catch (error) {
        reject(error);
        return;
      }

      if (!pending) {
        const batch: Batch<REQ, ITEM> = {
          entries: new Map(),
          controller: new AbortController(),
          waiting: 0,
        };
        batch.timer = setTimeout(() => dispatch(batch), windowMs);
        pending = batch;
      }
      const batch = pending;

      let entry = batch.entries.get(entryKey);
      if (!entry) {
        entry = { request, waiters: new Set() };
        batch.entries.set(entryKey, entry);
      }
      const currentEntry = entry;

      const onAbort = () => {
        currentEntry.waiters.delete(waiter);
        batch.waiting--;
        if (batch === pending) {
          // Not sent yet: drop the request, and the batch if it's now empty.
          if (!currentEntry.waiters.size) batch.entries.delete(entryKey);
          if (!batch.entries.size) {
            clearTimeout(batch.timer);
            pending = undefined;
          }
        } else if (!batch.waiting) {
          // In flight: only cancel once nobody is waiting on it.
          batch.controller.abort(signal?.reason);
        }
        reject(signal?.reason);
      };

      const waiter: Waiter<ITEM> = {
        resolve: (item) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(item);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      currentEntry.waiters.add(waiter);
      batch.waiting++;

      if (batch.entries.size >= maxBatchSize) dispatch(batch);
    });
};
