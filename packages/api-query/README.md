# @unruly-software/api-query

<div align="center">

<img src="https://github.com/unruly-software/api/blob/master/docs/logo.png" alt="Unruly Software API Framework" width="200" />

<br />
<br />

</div>

[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-query)
[![License](https://img.shields.io/github/license/unruly-software/api?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/unruly-software/api/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D&label=bundle%20size)](https://bundlephobia.com/package/@unruly-software/api-query)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?style=flat&colorA=18181B&colorB=3178c6)](https://www.typescriptlang.org/)
[![Downloads](https://img.shields.io/npm/dm/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-query)

React Query integration for @unruly-software/api-client that provides type-safe
hooks, automatic cache invalidation, and declarative data fetching. Transform
your API definitions into powerful React Query hooks with full TypeScript
inference.

## Quick Start

Install the package:

```bash
npm install @unruly-software/api-query @unruly-software/api-client @tanstack/react-query zod
# or
yarn add @unruly-software/api-query @unruly-software/api-client @tanstack/react-query zod
```

Set up your API and mount the query client:

```typescript
import { APIClient, defineAPI } from '@unruly-software/api-client';
import { mountAPIQueryClient } from '@unruly-software/api-query';
import { QueryClient } from '@tanstack/react-query';
import z from 'zod';

// Define your API (same as api-client)
const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const apiDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({
      userId: z.number(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    }),
    metadata: {
      method: 'GET',
      path: '/users/:userId',
    },
  }),

  updateUser: api.defineEndpoint({
    request: z.object({
      userId: z.number(),
      name: z.string(),
      email: z.string().email(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    }),
    metadata: {
      method: 'PUT',
      path: '/users/:userId',
    },
  }),
};

// Create API client and Query client
const apiClient = new APIClient(apiDefinition, {
  resolver: async ({ definition, request }) => {
    const response = await fetch(`https://api.example.com${definition.metadata.path}`, {
      method: definition.metadata.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return response.json();
  },
});

const queryClient = new QueryClient();

// Mount the query hooks
const { useAPIQuery, useAPIMutation } = mountAPIQueryClient(
  apiClient,
  queryClient,
  {
    getUser: {
      queryKey: ({ request }) => ['user', request?.userId],
    },
    updateUser: {
      invalidates: ({ response }) => [['user', response.id]],
    },
  }
);
```

Use in your React components:

```tsx
function UserProfile({ userId }: { userId: number }) {
  // Type-safe query with automatic cache management
  const { data: user, isLoading, error } = useAPIQuery('getUser', {
    data: { userId }
  });

  // Type-safe mutation with automatic invalidation
  const updateUserMutation = useAPIMutation('updateUser');

  const handleUpdate = async (name: string, email: string) => {
    await updateUserMutation.mutateAsync({
      userId,
      name,
      email,
    });
    // Cache automatically invalidated via configuration
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return null;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <button
      type="button"
        onClick={() => handleUpdate(user.name, user.email)}
        disabled={updateUserMutation.isPending}
      >
        Update User
      </button>
    </div>
  );
}
```

## Core Concepts

### React Query Integration

This package creates type-safe React Query hooks from your API definitions:

- **Queries**: `useAPIQuery` for data fetching with caching and background updates
- **Mutations**: `useAPIMutation` for data modifications with optimistic updates
- **Cache Management**: Automatic invalidation and updates based on your configuration
- **Type Safety**: Full TypeScript inference from your Zod schemas

### Query Configuration

Configure query behavior and cache management per endpoint:

```typescript
const config = {
  getUser: {
    // Custom query key generation
    queryKey: ({ request }) => ['user', request?.userId],

    // Query options (React Query options)
    queryOptions: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },

  updateUser: {
    // Invalidate related queries on success
    invalidates: ({ response }) => [
      ['user', response.id],
      ['users'], // Invalidate user list
    ],

    // Update cache directly without refetch
    updateCacheOnSuccess: ({ response }) => [
      [['user', response.id], response],
    ],

    // Mutation options
    mutationOptions: {
      onSuccess: () => {
        toast.success('User updated!');
      },
    },
  },
};
```

### Cache Invalidation

Automatic cache invalidation keeps your UI in sync:

- **On Success**: Invalidate queries when mutations succeed
- **On Error**: Optionally invalidate queries when mutations fail
- **Direct Updates**: Update cache directly for optimistic updates

### Error Handling

Errors are handled through React Query's built-in error system:

```typescript
const { data, error, isError } = useAPIQuery('getUser', {
  data: { userId: 123 }
});

if (isError) {
  // error is typed as Error and contains validation/network errors
  console.error('Query failed:', error.message);
}
```

## Examples

### Basic Setup with Provider

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function App() {
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <UserList />
    </QueryClientProvider>
  );
}
```

### Query with Conditional Fetching

```typescript
function UserProfile({ userId }: { userId?: number }) {
  // Query only runs when userId is provided
  const { data: user } = useAPIQuery('getUser', {
    data: userId ? { userId } : null, // null disables the query
    overrides: {
      enabled: Boolean(userId), // Additional condition
    },
  });

  return user ? <div>{user.name}</div> : null;
}
```

### Mutations with Optimistic Updates

```typescript
const config = {
  updateUser: {
    // Directly update cache for immediate UI feedback
    updateCacheOnSuccess: ({ request, response }) => [
      [['user', request.userId], response],
    ],

    // Invalidate list queries to refetch fresh data
    invalidates: ({ response }) => [
      ['users'], // Refetch user list
    ],
  },
};

const { useAPIMutation } = mountAPIQueryClient(apiClient, queryClient, config);

function EditUser({ user }: { user: User }) {
  const updateUserMutation = useAPIMutation('updateUser', {
    overrides: {
      onMutate: async (newUser) => {
        // Cancel ongoing queries
        await queryClient.cancelQueries({ queryKey: ['user', user.id] });

        // Optimistically update cache
        const previous = queryClient.getQueryData(['user', user.id]);
        queryClient.setQueryData(['user', user.id], newUser);

        return { previous };
      },
      onError: (err, newUser, context) => {
        // Rollback on error
        queryClient.setQueryData(['user', user.id], context?.previous);
      },
    },
  });

  return (
    <button type="button" onClick={() => updateUserMutation.mutate(updatedUser)}>
      Save Changes
    </button>
  );
}
```

### Advanced Cache Management

```typescript
const config = {
  deleteUser: {
    // Remove user from cache and invalidate lists
    updateCacheOnSuccess: ({ request }) => [
      [['user', request.userId], undefined], // Remove from cache
    ],
    invalidates: () => [
      ['users'], // Refetch user list
      ['user-count'], // Update count queries
    ],
  },

  createUser: {
    // Add new user to existing lists
    invalidates: () => [['users']],

    // Also update cache for specific queries
    updateCacheOnSuccess: ({ response }) => [
      [['user', response.id], response],
    ],

    // Handle errors by invalidating stale data
    errorInvalidates: () => [['users']],
  },
};
```

### Background Sync and Refetching

```typescript
function UserList() {
  const { data: users, refetch } = useAPIQuery('getUsers', {
    data: null,
    overrides: {
      staleTime: 30000, // Consider fresh for 30 seconds
      cacheTime: 300000, // Keep in cache for 5 minutes
      refetchOnWindowFocus: true, // Refetch when window gains focus
      refetchInterval: 60000, // Poll every minute
    },
  });

  return (
    <div>
      <button type="button" onClick={() => refetch()}>Refresh</button>
      {users?.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  );
}
```

### Error Handling and Retry Logic

```typescript
function UserData({ userId }: { userId: number }) {
  const {
    data: user,
    error,
    isError,
    isLoading,
    failureCount,
    refetch
  } = useAPIQuery('getUser', {
    data: { userId },
    overrides: {
      retry: (failureCount, error) => {
        // Retry up to 3 times for network errors only
        if (failureCount < 3 && error.message.includes('network')) {
          return true;
        }
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  });

  if (isLoading) return <Spinner />;

  if (isError) {
    return (
      <ErrorBoundary>
        <p>Failed to load user: {error.message}</p>
        <button type="button" onClick={() => refetch()}>
          Retry ({failureCount} attempts)
        </button>
      </ErrorBoundary>
    );
  }

  return <UserProfile user={user} />;
}
```

### Dependent Queries

```typescript
function UserWithProfile({ userId }: { userId: number }) {
  // First fetch user
  const { data: user } = useAPIQuery('getUser', {
    data: { userId }
  });

  // Then fetch profile if user is loaded
  const { data: profile } = useAPIQuery('getUserProfile', {
    data: user?.id ? { userId: user.id } : null, // Conditional fetching
  });

  return (
    <div>
      {user && <h1>{user.name}</h1>}
      {profile && <ProfileDetails profile={profile} />}
    </div>
  );
}
```

## API Reference

### `mountAPIQueryClient<API>(client, queryClient, config)`

Creates React Query hooks from your API client.

**Parameters:**
- `client: APIClient<API>` - Your API client instance
- `queryClient: QueryClient` - React Query client instance
- `config: QueryConfig<API>` - Configuration for each endpoint

**Returns:**
```typescript
{
  useAPIQuery: APIQueryHook<API>;
  useAPIMutation: APIMutationHook<API>;
}
```

### `useAPIQuery<ENDPOINT>(endpoint, options?)`

Hook for fetching data with React Query.

**Type Parameters:**
- `ENDPOINT` - Endpoint key from your API definitions

**Parameters:**
- `endpoint: ENDPOINT` - The endpoint to query
- `options?: APIQueryOptions<EndpointDefinition>` - Query options
  - `data: RequestType | null` - Request data (null disables query)
  - `overrides?: UseQueryOptions` - React Query options to override

**Returns:** `UseQueryResult<ResponseType, Error>`

### `useAPIMutation<ENDPOINT>(endpoint, options?)`

Hook for data mutations with React Query.

**Type Parameters:**
- `ENDPOINT` - Endpoint key from your API definitions

**Parameters:**
- `endpoint: ENDPOINT` - The endpoint to mutate
- `options?: APIMutationOptions<EndpointDefinition>` - Mutation options
  - `overrides?: UseMutationOptions` - React Query options to override

**Returns:** `UseMutationResult<ResponseType, Error, RequestType>`

### `QueryConfig<API>`

Configuration object for customizing query behavior per endpoint.

```typescript
type QueryConfig<API> = {
  [K in keyof API]: {
    // Custom query key generation
    queryKey?: (input: { request: RequestType | null }) => QueryKeyItem[];

    // Cache invalidation on success
    invalidates?: (input: {
      request: RequestType;
      response: ResponseType;
    }) => QueryKeyItem[][];

    // Cache invalidation on error
    errorInvalidates?: (input: {
      request: RequestType;
      error: Error;
    }) => QueryKeyItem[][];

    // Direct cache updates on success
    updateCacheOnSuccess?: (input: {
      request: RequestType;
      response: ResponseType;
    }) => [[QueryKeyItem[], unknown]];

    // Default query options
    queryOptions?: Omit<UseQueryOptions, 'queryFn' | 'queryKey'>;

    // Default mutation options
    mutationOptions?: Omit<UseMutationOptions, 'mutationFn'>;
  };
};
```

#### `QueryKeyItem`

Valid types for React Query keys.

```typescript
type QueryKeyItem = string | number | boolean | object | null | undefined;
```

### Query Key Generation

Default query keys follow the pattern: `[endpoint, requestData]`

Custom query keys can be configured per endpoint:

```typescript
const config = {
  getUser: {
    queryKey: ({ request }) => ['user', request?.userId],
  },
  getUsers: {
    queryKey: () => ['users'],
  },
  getUsersByRole: {
    queryKey: ({ request }) => ['users', 'by-role', request?.role],
  },
};
```

### Cache Invalidation Strategies

- **Invalidates**: Marks queries as stale and triggers refetch on success
- **ErrorInvalidates**: Invalidates cache when mutations fail

```typescript
const config = {
  updateUser: {
    // Strategy 1: Invalidate and refetch
    invalidates: ({ response }) => [
      ['user', response.id],
      ['users'],
    ],

    // Strategy 3: Error handling
    errorInvalidates: ({ request }) => [
      ['user', request.userId],
    ],
  },
};
```

## License

MIT
