import { renderHook, waitFor } from '@testing-library/react';
import { defineAPI, defineVirtualEndpoints } from '@unruly-software/api-client';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { defineAPIQueryKeys, mountAPIQueryClient, queryKey } from './index';
import { createTestEnv } from './testHelpers';

const { defineEndpoint } = defineAPI<{ path: string }>();

const Thumbnail = z.object({ fileId: z.string(), url: z.string() });

const api = {
  getThumbnails: defineEndpoint({
    request: z.object({ fileIds: z.array(z.string()) }),
    response: z.object({ items: z.array(Thumbnail) }),
    metadata: { path: '/thumbnails' },
  }),
};

const clientApi = defineVirtualEndpoints(api, (batched) => ({
  getThumbnail: batched({
    via: 'getThumbnails',
    request: z.object({ fileId: z.string() }),
    response: Thumbnail,
    toRequest: (reqs) => ({ fileIds: reqs.map((r) => r.fileId) }),
    fromResponse: (res, req) => res.items.find((t) => t.fileId === req.fileId),
    windowMs: 10,
  }),
}));

const queryKeys = defineAPIQueryKeys(clientApi, {
  getThumbnail: (req) => queryKey('thumbnail', req?.fileId),
});

const setup = () => {
  const env = createTestEnv(clientApi);
  env.mockResolver.mockImplementation(
    async ({ request }: { request: { fileIds: string[] } }) => ({
      items: request.fileIds.map((fileId) => ({
        fileId,
        url: `/t/${fileId}.png`,
      })),
    }),
  );
  const hooks = mountAPIQueryClient({
    apiClient: env.apiClient,
    queryClient: env.queryClient,
    queryKeys,
  });
  return { ...env, ...hooks };
};

describe('batched virtual endpoints with useAPIQuery', () => {
  it('resolves several queries with one batched request', async () => {
    const { useAPIQuery, wrapper, mockResolver, queryClient } = setup();

    const { result } = renderHook(
      () =>
        ['a', 'b', 'c'].map(
          (fileId) => useAPIQuery('getThumbnail', { data: { fileId } }).data,
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current).toEqual([
        { fileId: 'a', url: '/t/a.png' },
        { fileId: 'b', url: '/t/b.png' },
        { fileId: 'c', url: '/t/c.png' },
      ]);
    });
    expect(mockResolver).toHaveBeenCalledTimes(1);
    expect(mockResolver.mock.calls[0][0]).toMatchObject({
      endpoint: 'getThumbnails',
      request: { fileIds: ['a', 'b', 'c'] },
    });
    expect(queryClient.getQueryData(['thumbnail', 'b'])).toEqual({
      fileId: 'b',
      url: '/t/b.png',
    });
  });

  it('refetches invalidated items through a new batch', async () => {
    const { useAPIQuery, wrapper, mockResolver, queryClient } = setup();

    const { result } = renderHook(
      () =>
        ['a', 'b', 'c'].map(
          (fileId) =>
            useAPIQuery('getThumbnail', { data: { fileId } }).isSuccess,
        ),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current).toEqual([true, true, true]);
    });

    await queryClient.invalidateQueries({ queryKey: ['thumbnail', 'a'] });
    await queryClient.invalidateQueries({ queryKey: ['thumbnail', 'c'] });

    await waitFor(() => {
      expect(mockResolver).toHaveBeenCalledTimes(3);
    });
    expect(
      mockResolver.mock.calls.map(([call]) => call.request.fileIds),
    ).toEqual([['a', 'b', 'c'], ['a'], ['c']]);

    mockResolver.mockClear();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['thumbnail', 'a'] }),
      queryClient.invalidateQueries({ queryKey: ['thumbnail', 'c'] }),
    ]);
    expect(mockResolver).toHaveBeenCalledTimes(1);
    expect(mockResolver.mock.calls[0][0].request.fileIds).toEqual(['a', 'c']);
  });
});
