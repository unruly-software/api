import { act, renderHook, waitFor } from '@testing-library/react';
import {
  type APIEndpointDefinitions,
  defineAPI,
} from '@unruly-software/api-client';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import {
  defineAPIQueryKeys,
  mountAPIQueryClient,
  type QueryKeysFor,
  queryKey,
} from './index';
import { createTestEnv, type TestEnv, UserSchema } from './testHelpers';

// Slim PostSchema — distinct from the testHelpers export, which carries
// `content` and `authorId` for richer integration tests.
const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
});

const apiDef = defineAPI<{ method: 'GET' | 'POST' | 'PUT'; path: string }>();

const api = {
  // No queryKey defined anywhere — proves the [endpointName, request] default
  listPosts: apiDef.defineEndpoint({
    request: null,
    response: z.array(PostSchema),
    metadata: { method: 'GET', path: '/posts' },
  }),

  // Resolver lives in the queryKeys map passed to defineAPIQueryKeys
  getUser: apiDef.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: UserSchema,
    metadata: { method: 'GET', path: '/users/:id' },
  }),

  // Resolver lives in the queryKeys map, multi-element key
  searchPosts: apiDef.defineEndpoint({
    request: z.object({ query: z.string() }),
    response: z.array(PostSchema),
    metadata: { method: 'GET', path: '/posts/search' },
  }),

  // Mutation — invalidates the getUser query via the bundle's helper
  updateUser: apiDef.defineEndpoint({
    request: z.object({ userId: z.number(), name: z.string() }),
    response: UserSchema,
    metadata: { method: 'PUT', path: '/users/:id' },
  }),

  // Mutation — invalidates the listPosts query via the bundle's helper
  createPost: apiDef.defineEndpoint({
    request: z.object({ title: z.string() }),
    response: PostSchema,
    metadata: { method: 'POST', path: '/posts' },
  }),
} satisfies APIEndpointDefinitions;

const config = defineAPIQueryKeys(api, {
  getUser: (req) => queryKey('users', req?.userId),
  searchPosts: (req) => queryKey('posts', 'search', req?.query),
  // listPosts intentionally absent — falls back to default [endpointName, request]
});

// Per-endpoint behavior is passed to mountAPIQueryClient, where `config` exists
// and getKeyForEndpoint can be called inside invalidates callbacks. There is no
// recursive-config gotcha because the bundle is fully constructed by the time
// these callbacks are referenced.
const mountOptions = {
  endpoints: {
    updateUser: {
      invalidates: ({ response }: { response: { id: number } }) => [
        config.getKeyForEndpoint('getUser', { userId: response.id }),
      ],
    },
    createPost: {
      invalidates: () => [config.getKeyForEndpoint('listPosts')],
    },
  },
};

let queryClient: TestEnv<typeof api>['queryClient'];
let mockResolver: TestEnv<typeof api>['mockResolver'];
let apiClient: TestEnv<typeof api>['apiClient'];
let wrapper: TestEnv<typeof api>['wrapper'];

beforeEach(() => {
  ({ queryClient, mockResolver, apiClient, wrapper } = createTestEnv(api));
});

describe('queryKey identity helper', () => {
  it('is a runtime no-op (returns the rest-args tuple)', () => {
    // Rest-args form — queryKey(...args) returns the args as an array
    expect(queryKey('users', 5)).toEqual(['users', 5]);
    expect(queryKey('health')).toEqual(['health']);
    expect(queryKey('posts', 'search', 'react')).toEqual([
      'posts',
      'search',
      'react',
    ]);
  });

  it('preserves literal-tuple inference (compile-time)', () => {
    expectTypeOf(queryKey('users', 5)).toEqualTypeOf<readonly ['users', 5]>();

    const dynamicId: number = 5;
    expectTypeOf(queryKey('users', dynamicId)).toEqualTypeOf<
      readonly ['users', number]
    >();

    const dynamicQuery: string = 'react';
    expectTypeOf(queryKey('posts', 'search', dynamicQuery)).toEqualTypeOf<
      readonly ['posts', 'search', string]
    >();
  });

  it('regression: omitting queryKey widens to QueryKeyItem[]', () => {
    // Without queryKey(), the inferred return type widens via contextual typing
    // against QueryKeysMap<API>, collapsing the strict-mode union. This test
    // pins that behavior so a future contributor can't quietly delete the
    // helper without the test screaming.
    const widenedConfig = defineAPIQueryKeys(api, {
      getUser: (req: { userId: number } | undefined) =>
        ['users', req?.userId] as (string | number | undefined)[],
    });

    type WidenedKeys = QueryKeysFor<typeof widenedConfig>;
    // The getUser key collapses to (string | number | undefined)[] — proves
    // that without queryKey() the strict-mode story is dead.
    expectTypeOf<WidenedKeys>().not.toEqualTypeOf<
      ['users', number | undefined]
    >();
  });
});

describe('defineAPIQueryKeys (standalone resolver)', () => {
  it('preserves the api reference on the bundle', () => {
    expect(config.api).toBe(api);
  });

  it('exposes the raw queryKeys map the user passed in', () => {
    expect(config.queryKeys).toBeDefined();
    expect(config.queryKeys.getUser).toBeInstanceOf(Function);
    expect(config.queryKeys.searchPosts).toBeInstanceOf(Function);
  });

  it('falls back to [endpointName, request] when no resolver is registered', () => {
    expect(config.getKeyForEndpoint('listPosts')).toEqual([
      'listPosts',
      undefined,
    ]);
  });

  it('uses the registered resolver for getUser', () => {
    expect(config.getKeyForEndpoint('getUser', { userId: 5 })).toEqual([
      'users',
      5,
    ]);
  });

  it('uses the registered resolver for searchPosts (multi-element)', () => {
    expect(config.getKeyForEndpoint('searchPosts', { query: 'react' })).toEqual(
      ['posts', 'search', 'react'],
    );
  });

  it('getKey returns the rest-args tuple for full keys', () => {
    expect(config.getKey('users', 5)).toEqual(['users', 5]);
  });

  it('getKey accepts prefixes (proves AllQueryKeysFor permits prefixes)', () => {
    expect(config.getKey('users')).toEqual(['users']);
  });
});

describe('expectTypeOf — strict typed query keys', () => {
  it('getKeyForEndpoint returns the literal tuple shape for resolver-backed endpoints', () => {
    expectTypeOf(
      config.getKeyForEndpoint('getUser', { userId: 1 }),
    ).toEqualTypeOf<['users', number | undefined]>();

    expectTypeOf(
      config.getKeyForEndpoint('searchPosts', { query: 'x' }),
    ).toEqualTypeOf<['posts', 'search', string | undefined]>();
  });

  it('getKeyForEndpoint returns a tuple for default-fallback endpoints', () => {
    // listPosts has no resolver in queryKeys, so it gets the [endpointName, ...]
    // default. The exact request slot type depends on schema inference for
    // null requests; what matters here is that the first element is the
    // literal endpoint name.
    type ListPostsKey = ReturnType<
      typeof config.getKeyForEndpoint<'listPosts'>
    >;
    expectTypeOf<ListPostsKey[0]>().toEqualTypeOf<'listPosts'>();
  });

  it('QueryKeysFor<typeof config> includes all resolver-backed keys', () => {
    type AllKeys = QueryKeysFor<typeof config>;

    // Resolver-backed entries are present with their literal-tuple shapes
    type GetUserKey = Extract<AllKeys, ['users', any]>;
    expectTypeOf<GetUserKey>().toEqualTypeOf<['users', number | undefined]>();

    type SearchPostsKey = Extract<AllKeys, ['posts', 'search', any]>;
    expectTypeOf<SearchPostsKey>().toEqualTypeOf<
      ['posts', 'search', string | undefined]
    >();

    // Default-fallback entries are present too (mutations + listPosts)
    type UpdateUserKey = Extract<AllKeys, ['updateUser', any]>;
    expectTypeOf<UpdateUserKey>().toEqualTypeOf<
      ['updateUser', { userId: number; name: string } | undefined]
    >();

    type CreatePostKey = Extract<AllKeys, ['createPost', any]>;
    expectTypeOf<CreatePostKey>().toEqualTypeOf<
      ['createPost', { title: string } | undefined]
    >();
  });
});

describe('useAPIQuery — free-form mode (no type parameter)', () => {
  it('caches at the resolved key from the queryKeys map', async () => {
    const userData = { id: 5, name: 'John', email: 'john@example.com' };
    mockResolver.mockResolvedValue(userData);

    const { useAPIQuery } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result } = renderHook(
      () => useAPIQuery('getUser', { data: { userId: 5 } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Cache lands at the queryKeys-map resolved key, not the default
    expect(queryClient.getQueryData(['users', 5])).toEqual(userData);
    expect(
      queryClient.getQueryData(['getUser', { userId: 5 }]),
    ).toBeUndefined();
  });

  it('caches multi-element resolver keys correctly', async () => {
    const posts = [
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ];
    mockResolver.mockResolvedValue(posts);

    const { useAPIQuery } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result } = renderHook(
      () => useAPIQuery('searchPosts', { data: { query: 'react' } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['posts', 'search', 'react'])).toEqual(
      posts,
    );
  });

  it('falls back to the default key when no resolver is registered', async () => {
    const posts = [{ id: 1, title: 'a' }];
    mockResolver.mockResolvedValue(posts);

    const { useAPIQuery } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result } = renderHook(() => useAPIQuery('listPosts'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Default fallback shape is [endpointName, request]
    expect(queryClient.getQueryData(['listPosts', undefined])).toEqual(posts);
  });

  it('works without any mountOptions argument at all', async () => {
    mockResolver.mockResolvedValue({
      id: 1,
      name: 'a',
      email: 'a@b.co',
    });

    const { useAPIQuery } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
    });

    const { result } = renderHook(
      () => useAPIQuery('getUser', { data: { userId: 1 } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['users', 1])).toBeDefined();
  });
});

describe('useAPIQuery — strictly typed mode (with type parameter)', () => {
  it('strict mode is a runtime no-op — same caching behavior', async () => {
    const userData = { id: 7, name: 'Jane', email: 'jane@example.com' };
    mockResolver.mockResolvedValue(userData);

    const { useAPIQuery } = mountAPIQueryClient<
      typeof api,
      QueryKeysFor<typeof config>
    >({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result } = renderHook(
      () => useAPIQuery('getUser', { data: { userId: 7 } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['users', 7])).toEqual(userData);
  });
});

describe('cache invalidation via getKeyForEndpoint (mutation-driven)', () => {
  it('refetches the getUser query after updateUser mutation succeeds', async () => {
    const original = { id: 5, name: 'Original', email: 'a@b.co' };
    const updated = { id: 5, name: 'Updated', email: 'a@b.co' };

    mockResolver.mockResolvedValueOnce(original);

    const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result: queryResult } = renderHook(
      () => useAPIQuery('getUser', { data: { userId: 5 } }),
      { wrapper },
    );

    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    expect(queryResult.current.data).toEqual(original);

    // Read the cache via the helper to prove the keys round-trip
    expect(
      queryClient.getQueryData(
        config.getKeyForEndpoint('getUser', { userId: 5 }),
      ),
    ).toEqual(original);

    // The next two resolver calls (mutation + refetch) both return the
    // updated user.
    mockResolver.mockResolvedValue(updated);

    const { result: mutationResult } = renderHook(
      () => useAPIMutation('updateUser'),
      { wrapper },
    );

    await act(async () => {
      mutationResult.current.mutate({ userId: 5, name: 'Updated' });
    });

    // Mutation succeeded → invalidates fired → query refetched.
    await waitFor(() => expect(queryResult.current.data?.name).toBe('Updated'));
  });
});

describe('cache invalidation via direct queryClient.invalidateQueries', () => {
  it('invalidates a query whose key was built via getKeyForEndpoint', async () => {
    const posts = [{ id: 1, title: 'a' }];
    mockResolver.mockResolvedValue(posts);

    const { useAPIQuery } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result } = renderHook(
      () => useAPIQuery('searchPosts', { data: { query: 'react' } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const callsBefore = mockResolver.mock.calls.length;

    const key = config.getKeyForEndpoint('searchPosts', { query: 'react' });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    });

    await waitFor(() =>
      expect(mockResolver.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });
});

describe('cache invalidation via config.getKey on a prefix', () => {
  it('invalidates all users-prefixed queries via config.getKey("users")', async () => {
    const u1 = { id: 5, name: 'a', email: 'a@b.co' };
    const u2 = { id: 7, name: 'b', email: 'b@b.co' };
    mockResolver
      .mockResolvedValueOnce(u1)
      .mockResolvedValueOnce(u2)
      .mockResolvedValue(u1);

    const { useAPIQuery } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result: r1 } = renderHook(
      () => useAPIQuery('getUser', { data: { userId: 5 } }),
      { wrapper },
    );
    const { result: r2 } = renderHook(
      () => useAPIQuery('getUser', { data: { userId: 7 } }),
      { wrapper },
    );

    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    const callsBefore = mockResolver.mock.calls.length;

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: config.getKey('users'),
      });
    });

    await waitFor(() =>
      expect(mockResolver.mock.calls.length).toBeGreaterThanOrEqual(
        callsBefore + 2,
      ),
    );
  });
});

describe('event-based invalidation via mountOptions.endpoints[K]', () => {
  it('createPost mutation invalidates listPosts via the bundle helper', async () => {
    const initialPosts = [{ id: 1, title: 'first' }];
    const newPost = { id: 2, title: 'second' };
    const updatedPosts = [...initialPosts, newPost];

    mockResolver.mockResolvedValueOnce(initialPosts);

    const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      ...mountOptions,
    });

    const { result: queryResult } = renderHook(() => useAPIQuery('listPosts'), {
      wrapper,
    });
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));
    expect(queryResult.current.data).toEqual(initialPosts);

    // Next mutation call returns the new post; the subsequent refetch returns
    // the updated list.
    mockResolver
      .mockResolvedValueOnce(newPost)
      .mockResolvedValueOnce(updatedPosts);

    const { result: mutationResult } = renderHook(
      () => useAPIMutation('createPost'),
      { wrapper },
    );

    await act(async () => {
      mutationResult.current.mutate({ title: 'second' });
    });

    await waitFor(() => expect(queryResult.current.data).toEqual(updatedPosts));
  });
});
