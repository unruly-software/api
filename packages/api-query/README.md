# @unruly-software/api-query

<div align="center">

<img src="https://github.com/unruly-software/api/blob/master/docs/logo.png" alt="Unruly Software API Framework" width="200" />

<br />
<br />

</div>

[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-query)
[![License](https://img.shields.io/github/license/unruly-software/api?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/unruly-software/api/blob/main/LICENSE)
[![Coverage Status](https://img.shields.io/coverallsCoverage/github/unruly-software/api?branch=master&style=flat&colorA=18181B&colorB=28CF8D)](https://coveralls.io/github/unruly-software/api?branch=master)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D&label=bundle%20size)](https://bundlephobia.com/package/@unruly-software/api-query)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?style=flat&colorA=18181B&colorB=3178c6)](https://www.typescriptlang.org/)
[![Downloads](https://img.shields.io/npm/dm/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-query)

React Query integration for `@unruly-software/api-client`. Endpoint
definitions become typed `useAPIQuery` and `useAPIMutation` hooks with
declarative cache key resolvers and event-driven invalidation.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Defining Query Keys](#defining-query-keys)
- [Mounting the Hooks](#mounting-the-hooks)
- [Strict and Free-Form Modes](#strict-and-free-form-modes)
- [Per-Endpoint Configuration](#per-endpoint-configuration)
- [Hooks](#hooks)
- [API Reference](#api-reference)
- [License](#license)

## Installation

```bash
yarn add @unruly-software/api-query @unruly-software/api-client @tanstack/react-query zod
```

`@unruly-software/api-client` and `@tanstack/react-query` are peer
dependencies.

## Quick Start

```typescript
import { APIClient, defineAPI } from '@unruly-software/api-client';
import {
  defineAPIQueryKeys,
  mountAPIQueryClient,
  queryKey,
} from '@unruly-software/api-query';
import { QueryClient } from '@tanstack/react-query';
import z from 'zod';

const api = defineAPI<{ method: string; path: string }>();

const userAPI = {
  getUser: api.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: z.object({ id: z.number(), name: z.string() }),
    metadata: { method: 'GET', path: '/users/:userId' },
  }),
  updateUser: api.defineEndpoint({
    request: z.object({ userId: z.number(), name: z.string() }),
    response: z.object({ id: z.number(), name: z.string() }),
    metadata: { method: 'PUT', path: '/users/:userId' },
  }),
};

const apiClient = new APIClient(userAPI, { resolver: /* see api-client docs */ });
const queryClient = new QueryClient();

const queryKeys = defineAPIQueryKeys(userAPI, {
  getUser: (req) => queryKey('users', req?.userId),
});

const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
  apiClient,
  queryClient,
  queryKeys,
  endpoints: {
    updateUser: {
      invalidates: ({ response }) => [
        queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
      ],
    },
  },
});

function UserProfile({ userId }: { userId: number }) {
  const { data } = useAPIQuery('getUser', { data: { userId } });
  return data ? <h1>{data.name}</h1> : null;
}
```

## Defining Query Keys

`defineAPIQueryKeys(api, queryKeys)` registers a cache key resolver for each
endpoint and returns a bundle that `mountAPIQueryClient` consumes. Endpoints
omitted from the map fall back to `[endpointName, request | undefined]`.

```typescript
const queryKeys = defineAPIQueryKeys(userAPI, {
  getUser:     (req) => queryKey('users', req?.userId),
  searchUsers: (req) => queryKey('users', 'search', req?.query),
});
```

The `queryKey(...)` helper is a runtime no-op identity function. Wrap each
resolver's tuple in it so TypeScript captures the literal shape — without
the wrapper, contextual typing widens the literal away and strict mode
collapses to `QueryKeyItem[]`.

The returned bundle exposes:

| Member | Description |
|---|---|
| `queryKeys.api` | The api definition the bundle was built against. |
| `queryKeys.queryKeys` | The raw resolver map. |
| `queryKeys.getKey(first, ...rest)` | Builds a key prefix from positional arguments. The first argument is constrained to the registered first-position literals, so editor autocomplete narrows the suggestions. |
| `queryKeys.getKeyForEndpoint(endpoint, request?)` | Resolves the key for a specific endpoint by passing the endpoint's request shape. Falls back to the default `[endpointName, request]` when no resolver is registered. |

Both helpers return the literal tuple they constructed, which makes them safe
to pass directly to `queryClient.invalidateQueries`:

```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.getKey('users') });
queryClient.invalidateQueries({ queryKey: queryKeys.getKey('users', 5) });
queryClient.invalidateQueries({
  queryKey: queryKeys.getKeyForEndpoint('getUser', { userId: 5 }),
});
```

## Mounting the Hooks

`mountAPIQueryClient(args)` accepts a single configuration object and returns
the hook pair. Per-endpoint behavior lives under `endpoints[K]`. Because
`queryKeys` is fully constructed by the time this function runs, invalidation
callbacks can call its helpers directly.

```typescript
const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
  apiClient,
  queryClient,
  queryKeys,
  endpoints: {
    updateUser: {
      invalidates: ({ response }) => [
        queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
      ],
    },
  },
});
```

## Strict and Free-Form Modes

`mountAPIQueryClient` operates in two modes. The default is free-form;
strict mode is opt-in via a type parameter.

### Free-form (default)

In free-form mode, `invalidates` and `errorInvalidates` callbacks may return
any tuple of `QueryKeyItem` values. TypeScript still infers the request and
response types from the endpoint's Zod schemas, so callback inputs are fully
typed — only the return shape is unconstrained.

```typescript
mountAPIQueryClient({
  apiClient,
  queryClient,
  queryKeys,
  endpoints: {
    updateUser: {
      invalidates: ({ response }) => [
        ['users', response.id],
        ['users'],
      ],
    },
  },
});
```

Use free-form mode when migrating an existing codebase, when invalidating
cache entries that aren't owned by `defineAPIQueryKeys`, or when the strict
type-checking adds friction without benefit.

### Strict

Strict mode is enabled by passing `<typeof api, QueryKeysFor<typeof queryKeys>>`
as type parameters. `QueryKeysFor<...>` returns the union of full resolved
keys; the library expands every non-empty prefix internally when type-checking
`invalidates` and `errorInvalidates`, so both full keys and prefixes of
registered keys are accepted.

```typescript
import {
  mountAPIQueryClient,
  type QueryKeysFor,
} from '@unruly-software/api-query';

mountAPIQueryClient<typeof userAPI, QueryKeysFor<typeof queryKeys>>({
  apiClient,
  queryClient,
  queryKeys,
  endpoints: {
    updateUser: {
      invalidates: ({ response }) => [
        queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
        queryKeys.getKey('users'),
      ],
    },
  },
});
```

Wrong-shaped tuples become compile errors:

```typescript
endpoints: {
  updateUser: {
    invalidates: () => [
      // Type error — 'unknown-prefix' is not a registered first position
      ['unknown-prefix', 5],

      // Type error — 'users' expects number | undefined as the second
      // element, not a string
      ['users', 'not-a-number'],

      // Type error — 'users' has at most two elements
      ['users', 5, 'extra'],
    ],
  },
}
```

Use strict mode when cache keys are entirely owned by `defineAPIQueryKeys`
and you want refactoring a key shape to surface every consumer at compile
time.

#### Mixing in custom keys

Because `QueryKeysFor<...>` returns the union of full resolved keys (rather
than pre-expanding to prefixes), it composes cleanly with custom cache key
shapes via a union allowing integration with existing queries or libraries:

```typescript
type CustomKeys = ['my-feature', string] | ['analytics', number];

mountAPIQueryClient<
  typeof userAPI,
  QueryKeysFor<typeof queryKeys> | CustomKeys
>({
  apiClient,
  queryClient,
  queryKeys,
  endpoints: {
    updateUser: {
      invalidates: ({ response }) => [
        queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
        ['my-feature', 'related-cache-bucket'],
        ['analytics'], // ← prefix of ['analytics', number] is also accepted
      ],
    },
  },
});
```

Inline tuple types work too:

```typescript
mountAPIQueryClient<
  typeof userAPI,
  QueryKeysFor<typeof queryKeys> | ['my', 'custom', 'key']
>({ /* ... */ });
```

## Per-Endpoint Configuration

Each entry under `endpoints[K]` accepts four optional fields:

```typescript
endpoints: {
  updateUser: {
    invalidates: ({ request, response }) => [
      queryKeys.getKeyForEndpoint('getUser', { userId: response.id }),
    ],

    errorInvalidates: ({ request, error }) => [
      queryKeys.getKeyForEndpoint('getUser', { userId: request.userId }),
    ],

    queryOptions: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },

    mutationOptions: {
      retry: 2,
    },
  },
}
```

| Field | Description |
|---|---|
| `invalidates` | Fires after `apiClient.$succeeded`. Returns cache keys to invalidate. |
| `errorInvalidates` | Fires after `apiClient.$failed`. Returns cache keys to invalidate. |
| `queryOptions` | Default React Query options applied to every `useAPIQuery` call against this endpoint. Merged with — and overridden by — call-site `overrides`. `queryFn` and `queryKey` are managed by the bundle. |
| `mutationOptions` | Default React Query options applied to every `useAPIMutation` call against this endpoint. Merged with — and overridden by — call-site `overrides`. `mutationFn` is managed by the bundle. |

## Hooks

### `useAPIQuery`

```tsx
function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading, error } = useAPIQuery('getUser', {
    data: { userId },
    overrides: { staleTime: 60_000 },
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  return data ? <h1>{data.name}</h1> : null;
}
```

Endpoints whose request type is `null` make `data` optional; everything else
requires it. Pass `data: null` to disable the query without changing its
identity:

```tsx
useAPIQuery('getUser', { data: userId === null ? null : { userId } });
```

`overrides` accepts every React Query `useQuery` option except `queryFn` and
`queryKey`.

### `useAPIMutation`

```tsx
function EditUser({ user }: { user: { id: number } }) {
  const updateUser = useAPIMutation('updateUser', {
    overrides: {
      onSuccess: (saved) => toast(`Saved ${saved.name}`),
    },
  });

  return (
    <button
      type="button"
      disabled={updateUser.isPending}
      onClick={() =>
        updateUser.mutate({ userId: user.id, name: 'New name' })
      }
    >
      Save
    </button>
  );
}
```

The mutation's `variables` type is the endpoint's request payload; the
result type is its response. `overrides` accepts every React Query
`useMutation` option except `mutationFn`.

## API Reference

### `defineAPIQueryKeys(api, queryKeys)`

Registers cache key resolvers and returns a bundle.

```typescript
function defineAPIQueryKeys<API, const QUERY_KEYS extends QueryKeysMap<API>>(
  api: API,
  queryKeys: QUERY_KEYS,
): APIQueryConfigDefinition<API, QUERY_KEYS>;
```

The `<const QUERY_KEYS>` modifier preserves the literal shape of each
resolver's return value. Resolvers registered for endpoints that don't exist
on the api are rejected at compile time.

### `queryKey(...key)`

Identity helper that captures literal tuple inference inside resolver
function bodies.

```typescript
function queryKey<const T extends readonly QueryKeyItem[]>(...key: T): T;
```

### `mountAPIQueryClient(args)`

Wires the bundle to a `QueryClient` and returns the hook pair. Pass
`<typeof api, QueryKeysFor<typeof queryKeys>>` as type parameters for strict
mode; omit them for free-form mode.

```typescript
function mountAPIQueryClient<API, KEYS = readonly QueryKeyItem[]>(
  args: MountAPIQueryClientArgs<API, KEYS>,
): {
  useAPIQuery: APIQueryHook<API, KEYS>;
  useAPIMutation: APIMutationHook<API>;
};
```

### Type Helpers

| Type | Description |
|---|---|
| `QueryKeysFor<typeof bundle>` | Union of every cache key the bundle can produce. Pass as the second type parameter to `mountAPIQueryClient` to enable strict mode. |
| `QueryKeyForEndpoint<typeof bundle, 'getUser'>` | The resolved key tuple for a single endpoint. |
| `AllQueryKeysFor<typeof bundle>` | Union of every key prefix — the input type for `bundle.getKey`. |
| `QueryKeysMap<API>` | The shape `defineAPIQueryKeys` accepts as its second argument. |
| `APIQueryConfigDefinition<API, QUERY_KEYS>` | The bundle interface returned by `defineAPIQueryKeys`. |
| `MountAPIQueryClientArgs<API, KEYS>` | The single args object accepted by `mountAPIQueryClient`. |
| `EndpointConfig<API, K, KEYS>` | A single entry under `endpoints[K]`. |
| `APIQueryOptions<DEF, KEYS>` | The options object accepted by `useAPIQuery`. |
| `APIMutationOptions<DEF>` | The options object accepted by `useAPIMutation`. |
| `APIQueryHook<API, KEYS>` | The signature of `useAPIQuery`. |
| `APIMutationHook<API>` | The signature of `useAPIMutation`. |
| `MountedQueries<API, KEYS>` | The hook pair returned by `mountAPIQueryClient`. |

## License

MIT
