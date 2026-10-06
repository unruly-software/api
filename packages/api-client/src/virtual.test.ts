import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import z from 'zod';
import {
  APIClient,
  type APIEndpointDefinitions,
  type APIResolver,
} from './APIClient';
import { defineAPI } from './endpoint';
import {
  APIClientError,
  APIClientRequestParsingError,
  APIClientResponseParsingError,
} from './errors';
import { defineVirtualEndpoints, isBatchedEndpoint } from './virtual';

const { defineEndpoint } = defineAPI<{ path: string }>();

const Thumbnail = z.object({ fileId: z.string(), url: z.string() });

const api = {
  getThumbnails: defineEndpoint({
    request: z.object({ fileIds: z.array(z.string()).max(3) }),
    response: z.object({ items: z.array(Thumbnail) }),
    metadata: { path: '/thumbnails' },
  }),
  getUser: defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: z.object({ name: z.string() }),
    metadata: { path: '/user' },
  }),
};

const clientApi = defineVirtualEndpoints(api, (batched) => ({
  getThumbnail: batched({
    via: 'getThumbnails',
    request: z.object({ fileId: z.string() }),
    response: Thumbnail,
    toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
    fromResponse: (res, req) => res.items.find((t) => t.fileId === req.fileId),
    key: (req) => req.fileId,
    windowMs: 20,
  }),
}));

const thumbnailsFor = (fileIds: string[]) => ({
  items: fileIds
    .filter((id) => id !== 'missing')
    .map((fileId) => ({ fileId, url: `/t/${fileId}.png` })),
});

const makeClient = (
  resolver: APIResolver<typeof clientApi> = async ({ endpoint, request }) => {
    if (endpoint === 'getThumbnails') return thumbnailsFor(request.fileIds);
    if (endpoint === 'getUser') return { name: `user-${request.userId}` };
    throw new Error(`resolver called with ${endpoint}`);
  },
) => {
  const spy = vi.fn(resolver);
  return { resolver: spy, client: new APIClient(clientApi, { resolver: spy }) };
};

describe('virtual batched endpoints', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps real endpoints and adds the virtual one', () => {
    expect(Object.keys(clientApi)).toEqual([
      'getThumbnails',
      'getUser',
      'getThumbnail',
    ]);
    expect(isBatchedEndpoint(clientApi.getThumbnail)).toBe(true);
    expect(isBatchedEndpoint(clientApi.getThumbnails)).toBe(false);
  });

  it('sends requests made within the window as one batch', async () => {
    const { client, resolver } = makeClient();

    const results = Promise.all(
      ['a', 'b', 'a'].map((fileId) =>
        client.request('getThumbnail', { request: { fileId } }),
      ),
    );
    await vi.advanceTimersByTimeAsync(20);

    expect(await results).toEqual([
      { fileId: 'a', url: '/t/a.png' },
      { fileId: 'b', url: '/t/b.png' },
      { fileId: 'a', url: '/t/a.png' },
    ]);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0][0]).toMatchObject({
      endpoint: 'getThumbnails',
      definition: api.getThumbnails,
      request: { fileIds: ['a', 'b'] },
    });
  });

  it('passes real endpoints straight to the resolver', async () => {
    const { client, resolver } = makeClient();

    await expect(
      client.request('getUser', { request: { userId: 1 } }),
    ).resolves.toEqual({ name: 'user-1' });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('publishes topic events per item and none for the batch', async () => {
    const { client } = makeClient();
    const succeeded = vi.fn();
    const failed = vi.fn();
    client.$succeeded.subscribe(succeeded);
    client.$failed.subscribe(failed);

    const ok = client.request('getThumbnail', { request: { fileId: 'a' } });
    const missing = expect(
      client.request('getThumbnail', { request: { fileId: 'missing' } }),
    ).rejects.toThrow(
      'Batch response from "getThumbnails" did not include an item for "getThumbnail"',
    );
    await vi.advanceTimersByTimeAsync(20);
    await ok;
    await missing;

    expect(succeeded).toHaveBeenCalledTimes(1);
    expect(succeeded).toHaveBeenCalledWith({
      endpoint: 'getThumbnail',
      request: { fileId: 'a' },
      response: { fileId: 'a', url: '/t/a.png' },
    });
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0][0]).toMatchObject({
      endpoint: 'getThumbnail',
      request: { fileId: 'missing' },
    });
    expect(failed.mock.calls[0][0].error).toBeInstanceOf(APIClientError);
  });

  it('validates the single-item request before batching', async () => {
    const { client, resolver } = makeClient();

    await expect(
      client.request('getThumbnail', { request: { fileId: 1 as any } }),
    ).rejects.toBeInstanceOf(APIClientRequestParsingError);
    await vi.runAllTimersAsync();
    expect(resolver).not.toHaveBeenCalled();
  });

  it('fails every caller when the batch request is invalid', async () => {
    const { client, resolver } = makeClient();
    const failed = vi.fn();
    client.$failed.subscribe(failed);

    const results = Promise.allSettled(
      ['a', 'b', 'c', 'd'].map((fileId) =>
        client.request('getThumbnail', { request: { fileId } }),
      ),
    );
    await vi.advanceTimersByTimeAsync(20);

    const settled = await results;
    for (const result of settled) {
      expect(result.status).toBe('rejected');
      const { reason } = result as PromiseRejectedResult;
      expect(reason).toBeInstanceOf(APIClientRequestParsingError);
      expect(reason.endpoint).toBe('getThumbnails');
    }
    expect(resolver).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('formats batch validation errors with the validation stage', async () => {
    const { client } = makeClient(async () => ({ items: 'nope' }));
    const stages: string[] = [];
    client.setErrorFormatter((error, { stage }) => {
      stages.push(stage);
      return error;
    });

    const result = expect(
      client.request('getThumbnail', { request: { fileId: 'a' } }),
    ).rejects.toBeInstanceOf(APIClientResponseParsingError);
    await vi.advanceTimersByTimeAsync(20);
    await result;

    expect(stages).toEqual(['response-validation']);
  });

  it('allows virtual endpoints with no response', async () => {
    const markApi = defineVirtualEndpoints(api, (batched) => ({
      markSeen: batched({
        via: 'getThumbnails',
        request: z.object({ fileId: z.string() }),
        response: null,
        toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
        fromResponse: () => undefined,
      }),
    }));
    const client = new APIClient(markApi, {
      resolver: async () => ({ items: [] }),
    });

    const result = client.request('markSeen', { request: { fileId: 'a' } });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeUndefined();
  });

  it('rejects virtual endpoints that clash with real ones', () => {
    expect(() =>
      defineVirtualEndpoints(api, (batched) => ({
        // @ts-expect-error - name taken by a real endpoint
        getUser: batched({
          via: 'getThumbnails',
          request: z.object({ fileId: z.string() }),
          response: Thumbnail,
          toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
          fromResponse: () => undefined,
        }),
      })),
    ).toThrow('Virtual endpoint "getUser" clashes with a real endpoint');
  });

  it('fails every caller when the batch response is invalid', async () => {
    const { client } = makeClient(async () => ({ items: 'nope' }));

    const results = Promise.allSettled(
      ['a', 'b'].map((fileId) =>
        client.request('getThumbnail', { request: { fileId } }),
      ),
    );
    await vi.advanceTimersByTimeAsync(20);

    for (const result of await results) {
      const { reason } = result as PromiseRejectedResult;
      expect(reason).toBeInstanceOf(APIClientResponseParsingError);
      expect(reason.endpoint).toBe('getThumbnails');
    }
  });

  it('validates each picked item against the single-item response', async () => {
    const strictApi = defineVirtualEndpoints(api, (batched) => ({
      getThumbnail: batched({
        via: 'getThumbnails',
        request: z.object({ fileId: z.string() }),
        response: Thumbnail.extend({ url: z.string().startsWith('https') }),
        toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
        fromResponse: (res, req) =>
          res.items.find((t) => t.fileId === req.fileId),
      }),
    }));
    const client = new APIClient(strictApi, {
      resolver: async () => ({ items: [{ fileId: 'a', url: '/a.png' }] }),
    });

    const result = expect(
      client.request('getThumbnail', { request: { fileId: 'a' } }),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof APIClientResponseParsingError &&
        error.endpoint === 'getThumbnail',
    );
    await vi.runAllTimersAsync();
    await result;
  });

  it('formats errors once per caller', async () => {
    const { client } = makeClient(async () => {
      throw new Error('network down');
    });
    const formatter = vi.fn(
      (error: Error, _context: { stage: string }) =>
        new Error(`formatted: ${error.message}`),
    );
    client.setErrorFormatter(formatter);

    const results = Promise.allSettled(
      ['a', 'b'].map((fileId) =>
        client.request('getThumbnail', { request: { fileId } }),
      ),
    );
    await vi.advanceTimersByTimeAsync(20);

    expect(
      (await results).map((r) => (r as PromiseRejectedResult).reason.message),
    ).toEqual(['formatted: network down', 'formatted: network down']);
    expect(formatter).toHaveBeenCalledTimes(2);
    expect(formatter.mock.calls[0][1]).toEqual({ stage: 'resolver' });
  });

  it('forwards the batch abort signal to the resolver', async () => {
    let batchSignal: AbortSignal | undefined;
    const { client } = makeClient(({ abortSignal }) => {
      batchSignal = abortSignal;
      return new Promise(() => {});
    });
    const controller = new AbortController();

    const pending = expect(
      client.request('getThumbnail', {
        request: { fileId: 'a' },
        abort: controller.signal,
      }),
    ).rejects.toThrow('unmounted');
    await vi.advanceTimersByTimeAsync(20);

    controller.abort(new Error('unmounted'));
    await pending;
    expect(batchSignal?.aborted).toBe(true);
  });

  it('keeps separate batches per client instance', async () => {
    const first = makeClient();
    const second = makeClient();

    const results = Promise.all([
      first.client.request('getThumbnail', { request: { fileId: 'a' } }),
      second.client.request('getThumbnail', { request: { fileId: 'b' } }),
    ]);
    await vi.advanceTimersByTimeAsync(20);
    await results;

    expect(first.resolver).toHaveBeenCalledTimes(1);
    expect(second.resolver).toHaveBeenCalledTimes(1);
  });

  describe('types', () => {
    it('types the virtual endpoint on the client', () => {
      const { client } = makeClient();
      type Request = Parameters<typeof client.request<'getThumbnail'>>[1];

      expectTypeOf<Request>().toMatchTypeOf<{ request: { fileId: string } }>();
      expectTypeOf(
        client.request<'getThumbnail'>,
      ).returns.resolves.toEqualTypeOf<{ fileId: string; url: string }>();
    });

    it('still accepts a resolver from a generic wrapper', () => {
      const make = <T extends APIEndpointDefinitions>(
        definitions: T,
        resolver: APIResolver<T>,
      ) => new APIClient(definitions, { resolver });

      expectTypeOf(make(clientApi, async () => null)).toEqualTypeOf<
        APIClient<typeof clientApi>
      >();
    });

    it('checks the batch mapping against the via endpoint', () => {
      defineVirtualEndpoints(api, (batched) => ({
        getThumbnail: batched({
          via: 'getThumbnails',
          request: z.object({ fileId: z.string() }),
          response: Thumbnail,
          toRequest: (reqs) => {
            expectTypeOf(reqs).toEqualTypeOf<{ fileId: string }[]>();
            return { fileIds: reqs.map((r) => r.fileId) };
          },
          fromResponse: (res, req) => {
            expectTypeOf(res).toEqualTypeOf<{
              items: { fileId: string; url: string }[];
            }>();
            expectTypeOf(req).toEqualTypeOf<{ fileId: string }>();
            return undefined;
          },
        }),
      }));

      defineVirtualEndpoints(api, (batched) => ({
        getThumbnail: batched({
          // @ts-expect-error - not an endpoint
          via: 'nope',
          request: z.object({ fileId: z.string() }),
          response: Thumbnail,
          toRequest: () => ({ fileIds: [] }),
          fromResponse: () => undefined,
        }),
      }));

      defineVirtualEndpoints(api, (batched) => ({
        getThumbnail: batched({
          via: 'getThumbnails',
          request: z.object({ fileId: z.string() }),
          response: Thumbnail,
          // @ts-expect-error - wrong request shape for getThumbnails
          toRequest: (reqs) => ({ ids: reqs.map((r) => r.fileId) }),
          fromResponse: () => undefined,
        }),
      }));

      defineVirtualEndpoints(api, (batched) => ({
        getThumbnail: batched({
          via: 'getThumbnails',
          request: z.object({ fileId: z.string() }),
          response: Thumbnail,
          toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
          // @ts-expect-error - item doesn't match the single-item response
          fromResponse: () => ({ fileId: 1 }),
        }),
      }));
    });
  });
});
