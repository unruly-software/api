import { act, renderHook, waitFor } from '@testing-library/react';
import {
  type APIEndpointDefinitions,
  defineAPI,
} from '@unruly-software/api-client';
import { beforeEach, describe, expect, it } from 'vitest';
import z from 'zod';
import { defineAPIQueryKeys, mountAPIQueryClient, queryKey } from './index';
import { createTestEnv, PostSchema, type TestEnv } from './testHelpers';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const testDefinition = {
  searchPosts: api.defineEndpoint({
    metadata: { path: '/posts', method: 'GET' },
    request: z.object({
      query: z.string(),
      page: z.number().optional(),
    }),
    response: z.object({
      posts: z.array(PostSchema),
      nextPage: z.number().optional(),
    }),
  }),

  createPost: api.defineEndpoint({
    metadata: { path: '/posts', method: 'POST' },
    request: z.object({ title: z.string() }),
    response: PostSchema,
  }),
} satisfies APIEndpointDefinitions;

const config = defineAPIQueryKeys(testDefinition, {
  searchPosts: (request) => queryKey('posts', 'search', request?.query),
});

const post = (id: number) => ({
  id,
  title: `Post ${id}`,
  content: '',
  authorId: 1,
});

const pageOptions = {
  initialPageParam: 1,
  withPageParam: (data: { query: string }, page: number) => ({
    ...data,
    page,
  }),
  getNextPageParam: (last: { nextPage?: number }) => last.nextPage,
};

describe('useAPIInfiniteQuery', () => {
  let env: TestEnv<typeof testDefinition>;

  beforeEach(() => {
    env = createTestEnv(testDefinition);
  });

  const mount = () =>
    mountAPIQueryClient({
      apiClient: env.apiClient,
      queryClient: env.queryClient,
      queryKeys: config,
      endpoints: {
        createPost: {
          invalidates: () => [config.getKey('posts')],
        },
      },
    });

  const renderSearch = (
    useAPIInfiniteQuery: ReturnType<typeof mount>['useAPIInfiniteQuery'],
  ) =>
    renderHook(
      () =>
        useAPIInfiniteQuery('searchPosts', {
          data: { query: 'react' },
          ...pageOptions,
        }),
      { wrapper: env.wrapper },
    );

  it('fetches each page with the request built by withPageParam', async () => {
    const { useAPIInfiniteQuery } = mount();
    env.mockResolver.mockImplementation(({ request }) =>
      request.page === 1
        ? { posts: [post(1)], nextPage: 2 }
        : { posts: [post(2)] },
    );

    const { result } = renderSearch(useAPIInfiniteQuery);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.posts)).toEqual([
        post(1),
        post(2),
      ]),
    );
    expect(result.current.hasNextPage).toBe(false);
    expect(env.mockResolver.mock.calls.map(([c]) => c.request)).toEqual([
      { query: 'react', page: 1 },
      { query: 'react', page: 2 },
    ]);
    expect(env.mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
  });

  it('caches under the endpoint key with an $infinite suffix', async () => {
    const { useAPIInfiniteQuery } = mount();
    env.mockResolver.mockResolvedValue({ posts: [post(1)] });

    const { result } = renderSearch(useAPIInfiniteQuery);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      env.queryClient.getQueryData(['posts', 'search', 'react', '$infinite']),
    ).toEqual({ pages: [{ posts: [post(1)] }], pageParams: [1] });
  });

  it('is disabled when data is null, even if overrides enable it', () => {
    const { useAPIInfiniteQuery } = mount();

    const { result } = renderHook(
      () =>
        useAPIInfiniteQuery('searchPosts', {
          data: null,
          ...pageOptions,
          overrides: { enabled: true },
        }),
      { wrapper: env.wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(env.mockResolver).not.toHaveBeenCalled();
  });

  it('refetches when a mutation invalidates a prefix of its key', async () => {
    const { useAPIInfiniteQuery, useAPIMutation } = mount();
    env.mockResolver.mockResolvedValue({ posts: [post(1)] });

    const { result } = renderSearch(useAPIInfiniteQuery);
    await waitFor(() =>
      expect(result.current.data?.pages[0]?.posts).toEqual([post(1)]),
    );

    env.mockResolver.mockImplementation(({ endpoint }) =>
      endpoint === 'createPost' ? post(2) : { posts: [post(2), post(1)] },
    );
    const { result: mutation } = renderHook(
      () => useAPIMutation('createPost'),
      { wrapper: env.wrapper },
    );
    await act(() => mutation.current.mutateAsync({ title: 'Post 2' }));

    await waitFor(() =>
      expect(result.current.data?.pages[0]?.posts).toEqual([post(2), post(1)]),
    );
  });
});
