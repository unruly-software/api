import { QueryClient } from '@tanstack/react-query';
import { APIClient, defineAPI } from '@unruly-software/api-client';
import { beforeEach, describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import {
  defineAPIQueryKeys,
  mountAPIQueryClient,
  type QueryKeysFor,
  queryKey,
} from './index';

// Entire file is type-only — skip at runtime.
beforeEach((t) => {
  t.skip();
});

const api_def = defineAPI<{ method: 'GET' | 'POST' | 'PUT'; path: string }>();

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
});

const api = {
  // Resolver-backed endpoint — strict key will be ['users', number | undefined]
  getUser: api_def.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: UserSchema,
    metadata: { method: 'GET', path: '/users/:id' },
  }),

  // Resolver-backed endpoint — strict key will be ['posts', 'search', string | undefined]
  searchPosts: api_def.defineEndpoint({
    request: z.object({ query: z.string() }),
    response: z.array(PostSchema),
    metadata: { method: 'GET', path: '/posts/search' },
  }),

  // NO resolver registered — strict key falls back to default
  listPosts: api_def.defineEndpoint({
    request: null,
    response: z.array(PostSchema),
    metadata: { method: 'GET', path: '/posts' },
  }),

  // Mutation — NO resolver registered — default fallback
  updateUser: api_def.defineEndpoint({
    request: z.object({ userId: z.number(), name: z.string() }),
    response: UserSchema,
    metadata: { method: 'PUT', path: '/users/:id' },
  }),
};

const config = defineAPIQueryKeys(api, {
  getUser: (req) => queryKey('users', req?.userId),
  searchPosts: (req) => queryKey('posts', 'search', req?.query),
  // listPosts and updateUser intentionally absent
});

const queryClient = new QueryClient();
const apiClient = new APIClient(api, { resolver: async () => ({}) });

// Strict mode: KEYS is explicitly set to the inferred union
const strict = mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
  apiClient,
  queryClient,
  queryKeys: config,
  endpoints: {
    updateUser: {
      // Correct — uses the helper to build a key from the union
      invalidates: ({ response }) => [
        config.getKeyForEndpoint('getUser', { userId: response.id }),
      ],
      errorInvalidates: ({ request }) => [
        config.getKeyForEndpoint('getUser', { userId: request.userId }),
      ],
    },
  },
});

// Free-form mode: KEYS defaults to readonly QueryKeyItem[]
const freeForm = mountAPIQueryClient({
  apiClient,
  queryClient,
  queryKeys: config,
  endpoints: {
    updateUser: {
      // Any tuple shape is accepted because KEYS is unconstrained
      invalidates: () => [
        ['arbitrary', 'free-form', 'key'],
        ['yet', 'another', 42, true],
      ],
      errorInvalidates: () => [['anything', 'goes']],
    },
  },
});

describe('defineAPIQueryKeys — resolver registration types', () => {
  it('accepts resolvers for endpoints that exist on the api', () => {
    defineAPIQueryKeys(api, {
      getUser: (req) => queryKey('users', req?.userId),
      searchPosts: (req) => queryKey('posts', 'search', req?.query),
    });
  });

  it('rejects resolvers for endpoints that do not exist on the api', () => {
    defineAPIQueryKeys(api, {
      getUser: (req) => queryKey('users', req?.userId),
      // @ts-expect-error — 'nonExistentEndpoint' is not a key of api; NoExtraQueryKeys collapses extras to never
      nonExistentEndpoint: () => queryKey('nope'),
    });
  });

  it('types the resolver request parameter correctly', () => {
    defineAPIQueryKeys(api, {
      getUser: (req) => {
        expectTypeOf(req).toEqualTypeOf<{ userId: number } | undefined>();
        return queryKey('users', req?.userId);
      },
      searchPosts: (req) => {
        expectTypeOf(req).toEqualTypeOf<{ query: string } | undefined>();
        return queryKey('posts', 'search', req?.query);
      },
    });
  });
});

describe('config.getKeyForEndpoint — always strictly typed', () => {
  it('accepts correct endpoint + matching request shape', () => {
    config.getKeyForEndpoint('getUser', { userId: 5 });
    config.getKeyForEndpoint('searchPosts', { query: 'react' });
    config.getKeyForEndpoint('listPosts'); // default fallback, no request
    config.getKeyForEndpoint('updateUser', { userId: 1, name: 'a' });
  });

  it('returns the literal tuple shape from the resolver', () => {
    expectTypeOf(
      config.getKeyForEndpoint('getUser', { userId: 5 }),
    ).toEqualTypeOf<['users', number | undefined]>();

    expectTypeOf(
      config.getKeyForEndpoint('searchPosts', { query: 'x' }),
    ).toEqualTypeOf<['posts', 'search', string | undefined]>();
  });

  it('rejects non-existent endpoint names', () => {
    // @ts-expect-error — 'nonExistent' is not a key of api
    config.getKeyForEndpoint('nonExistent', {});
  });

  it('rejects wrong request shapes', () => {
    // @ts-expect-error — getUser expects { userId: number }, not { wrongField: string }
    config.getKeyForEndpoint('getUser', { wrongField: 'x' });

    // @ts-expect-error — getUser expects userId as number, not string
    config.getKeyForEndpoint('getUser', { userId: 'not-a-number' });

    // @ts-expect-error — searchPosts expects { query: string }, not a number
    config.getKeyForEndpoint('searchPosts', { query: 42 });
  });
});

describe('config.getKey — always strictly typed against the bundle', () => {
  it('accepts full keys matching one of the resolved shapes', () => {
    config.getKey('users', 5);
    config.getKey('users', undefined);
    config.getKey('posts', 'search', 'react');
  });

  it('accepts prefixes of resolved shapes', () => {
    config.getKey('users');
    config.getKey('posts');
    config.getKey('posts', 'search');
  });

  it('rejects keys that do not start with a registered prefix', () => {
    // @ts-expect-error — 'wrong-prefix' is not the start of any registered key
    config.getKey('wrong-prefix', 5);

    // @ts-expect-error — ('users', 5, 'extra') is longer than ('users', number)
    config.getKey('users', 5, 'extra');

    // @ts-expect-error — 'posts', 'wrong-subtype' is not a known prefix
    config.getKey('posts', 'wrong-subtype');
  });

  it('drives first-position autocomplete from a non-generic union (regression guard)', () => {
    // This test pins the parameter shape that gives first-position autocomplete.
    // If `getKey` is ever changed back to a generic-constrained form
    // (`<T extends Union>(...args: T)`) the editor stops narrowing the first
    // arg to the union of registered prefixes — but the runtime negative tests
    // above keep passing, hiding the regression. So we explicitly assert that
    // the rest-parameter type IS a union of tuples that includes every prefix
    // for the registered resolvers.
    type GetKeyParams = Parameters<typeof config.getKey>;

    // The non-generic union should permit each registered prefix as a tuple
    // member. Each line below MUST be assignable to GetKeyParams or the
    // type is not what we expect.
    const usersFull: GetKeyParams = ['users', 5];
    const usersPrefix: GetKeyParams = ['users'];
    const postsPrefix: GetKeyParams = ['posts'];
    const postsSearchPrefix: GetKeyParams = ['posts', 'search'];
    const postsSearchFull: GetKeyParams = ['posts', 'search', 'react'];

    void usersFull;
    void usersPrefix;
    void postsPrefix;
    void postsSearchPrefix;
    void postsSearchFull;

    // The same union must reject prefixes that aren't registered.
    // @ts-expect-error — 'wrong' is not a valid first position
    const _bad: GetKeyParams = ['wrong'];
    void _bad;
  });

  it('per-call narrowing: return type is the specific tuple the user passed', () => {
    // The `<const FIRST, const REST>` generics on `getKey` capture the
    // literal arguments at the call site, so the return type is the exact
    // tuple.
    expectTypeOf(config.getKey('users')).toEqualTypeOf<readonly ['users']>();
    expectTypeOf(config.getKey('users', 5)).toEqualTypeOf<
      readonly ['users', 5]
    >();
    expectTypeOf(config.getKey('posts')).toEqualTypeOf<readonly ['posts']>();
    expectTypeOf(config.getKey('posts', 'search')).toEqualTypeOf<
      readonly ['posts', 'search']
    >();
    expectTypeOf(config.getKey('posts', 'search', 'react')).toEqualTypeOf<
      readonly ['posts', 'search', 'react']
    >();
  });

  it('rejects wrong rest-arg shapes after a valid first key', () => {
    // The rest-position constraint still bites even though it doesn't drive
    // autocomplete. These are the negative cases that prove the typing isn't
    // just `(first: string, ...rest: unknown[])` in disguise.

    // @ts-expect-error — 'wrong-sub' is not a valid second arg after 'posts'
    config.getKey('posts', 'wrong-sub');

    // @ts-expect-error — passing a number where the resolver expects 'search'
    config.getKey('posts', 42);

    // @ts-expect-error — too many args after 'users' (expected 0 or 1)
    config.getKey('users', 5, 'extra');
  });
});

describe('useAPIQuery — queryKey is not overridable at the call site', () => {
  it('omits queryKey from overrides so users cannot override the generated key', () => {
    // The whole point of defineAPIQueryKeys is to centralize key generation.
    // APIQueryOptions.overrides uses Omit<UseQueryOptions, 'queryFn' | 'queryKey'>
    // which forbids setting queryKey at the call site in BOTH modes.
    strict.useAPIQuery('getUser', {
      data: { userId: 1 },
      overrides: {
        // @ts-expect-error — queryKey is omitted from overrides
        queryKey: config.getKeyForEndpoint('getUser', { userId: 1 }),
      },
    });

    freeForm.useAPIQuery('getUser', {
      data: { userId: 1 },
      overrides: {
        // @ts-expect-error — queryKey is omitted from overrides even in free-form mode
        queryKey: ['anything'] as const,
      },
    });
  });

  it('allows non-queryKey overrides like staleTime in both modes', () => {
    strict.useAPIQuery('getUser', {
      data: { userId: 1 },
      overrides: {
        staleTime: 5000,
        enabled: true,
      },
    });

    freeForm.useAPIQuery('getUser', {
      data: { userId: 1 },
      overrides: {
        staleTime: 5000,
        enabled: true,
      },
    });
  });

  it('rejects calling useAPIQuery with an unknown endpoint', () => {
    // @ts-expect-error — 'nonExistent' is not a key of the api
    strict.useAPIQuery('nonExistent');

    // @ts-expect-error — endpoint name is still checked even in free-form mode
    freeForm.useAPIQuery('nonExistent');
  });

  it('rejects calling useAPIQuery with a wrong-shaped request', () => {
    strict.useAPIQuery('getUser', {
      // @ts-expect-error — getUser requires { userId: number }
      data: { userId: 'wrong' },
    });

    freeForm.useAPIQuery('getUser', {
      // @ts-expect-error — request shape is still checked even in free-form mode
      data: { userId: 'wrong' },
    });
  });
});

describe('mountAPIQueryClient options.endpoints[K].invalidates — strict mode', () => {
  it('accepts callbacks that return keys matching the union', () => {
    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          // Built via the helper — always type-safe
          invalidates: ({ response }) => [
            config.getKeyForEndpoint('getUser', { userId: response.id }),
            config.getKeyForEndpoint('searchPosts', { query: 'any' }),
          ],
        },
      },
    });
  });

  it('rejects callbacks that return keys outside the union', () => {
    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          // @ts-expect-error — ['wrong'] is not in QueryKeysFor<typeof config>
          invalidates: () => [['wrong'] as const],
        },
      },
    });

    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          // @ts-expect-error — ['users', 'not-a-number'] has wrong element type
          invalidates: () => [['users', 'not-a-number'] as const],
        },
      },
    });
  });

  it('rejects callbacks that return keys with wrong element types', () => {
    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          // @ts-expect-error — 'posts' needs a 'search' sub-key, not 'wrong-sub'
          invalidates: () => [['posts', 'wrong-sub', 'x'] as const],
        },
      },
    });
  });

  it('rejects errorInvalidates callbacks that return wrong keys', () => {
    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          // @ts-expect-error — ['bogus', 'key'] is not in the union
          errorInvalidates: () => [['bogus', 'key'] as const],
        },
      },
    });
  });

  it('rejects configuring endpoints that do not exist on the api', () => {
    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        // @ts-expect-error — 'nonExistentEndpoint' is not a key of the api
        nonExistentEndpoint: {
          invalidates: () => [['users', 1] as const],
        },
      },
    });
  });

  it('accepts prefixes of registered keys (not just full tuples)', () => {
    // The key insight: `QueryKeysFor<typeof config>` returns the FULL
    // resolved keys, but the library expands prefixes inside `invalidates`
    // / `errorInvalidates`. So `getKey('users')` (a 1-element prefix of
    // the 2-element `['users', number | undefined]` key) is allowed.
    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config>>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          invalidates: () => [
            config.getKey('users'),
            config.getKey('posts'),
            config.getKey('posts', 'search'),
          ],
        },
      },
    });
  });

  it('accepts a custom-keys union alongside QueryKeysFor', () => {
    // The whole point of keeping QueryKeysFor as full tuples (rather than
    // pre-expanding to prefixes): consumers can union their own cache key
    // shapes into the strict-mode constraint and the library will expand
    // prefixes from the merged union.
    type CustomKey = ['my', 'custom', 'key'];

    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config> | CustomKey>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          invalidates: () => [
            config.getKeyForEndpoint('getUser', { userId: 1 }),
            ['my', 'custom', 'key'] as const,
            ['my', 'custom'] as const,
            ['my'] as const,
          ],
        },
      },
    });

    mountAPIQueryClient<typeof api, QueryKeysFor<typeof config> | CustomKey>({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          // @ts-expect-error — 'unrelated' isn't a registered prefix or in
          // the custom-keys union
          invalidates: () => [['unrelated'] as const],
        },
      },
    });
  });
});

describe('mountAPIQueryClient options.endpoints[K].invalidates — free-form mode', () => {
  it('accepts callbacks that return any tuple shape', () => {
    mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          invalidates: () => [
            ['arbitrary', 'key'],
            ['whatever', 1, true, null],
            [42],
          ],
          errorInvalidates: () => [['anything']],
        },
      },
    });
  });

  it('still enforces endpoint names and callback input types', () => {
    mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        // @ts-expect-error — 'nonExistent' is not a key of the api
        nonExistent: {
          invalidates: () => [['x']],
        },
      },
    });

    mountAPIQueryClient({
      apiClient,
      queryClient,
      queryKeys: config,
      endpoints: {
        updateUser: {
          invalidates: ({ request, response }) => {
            // Even in free-form mode, the input to the callback is fully typed
            expectTypeOf(request).toEqualTypeOf<{
              userId: number;
              name: string;
            }>();
            expectTypeOf(response).toEqualTypeOf<{
              id: number;
              name: string;
              email: string;
            }>();
            return [['x']];
          },
        },
      },
    });
  });
});

describe('QueryKeysFor<typeof config> — resolved union shape', () => {
  type AllKeys = QueryKeysFor<typeof config>;

  it('includes resolver-backed entries as literal tuples', () => {
    type GetUserKey = Extract<AllKeys, ['users', any]>;
    expectTypeOf<GetUserKey>().toEqualTypeOf<['users', number | undefined]>();

    type SearchPostsKey = Extract<AllKeys, ['posts', 'search', any]>;
    expectTypeOf<SearchPostsKey>().toEqualTypeOf<
      ['posts', 'search', string | undefined]
    >();
  });

  it('includes default-fallback entries for endpoints without resolvers', () => {
    type UpdateUserKey = Extract<AllKeys, ['updateUser', any]>;
    expectTypeOf<UpdateUserKey>().toEqualTypeOf<
      ['updateUser', { userId: number; name: string } | undefined]
    >();
  });

  it('does NOT include keys that were never registered', () => {
    type WrongKey = Extract<AllKeys, ['nope', any]>;
    expectTypeOf<WrongKey>().toEqualTypeOf<never>();
  });
});

describe('queryKey identity helper — type preservation', () => {
  it('preserves literal types for direct rest arguments', () => {
    expectTypeOf(queryKey('users', 5)).toEqualTypeOf<readonly ['users', 5]>();

    expectTypeOf(queryKey('posts', 'search', 'react')).toEqualTypeOf<
      readonly ['posts', 'search', 'react']
    >();
  });

  it('widens element types only when source values are non-literal', () => {
    const dynamicId: number = 5;
    expectTypeOf(queryKey('users', dynamicId)).toEqualTypeOf<
      readonly ['users', number]
    >();
  });
});

// Suppress "variable declared but never used" warnings for the mount results
// kept around purely to anchor the type tests above.
void strict;
void freeForm;
