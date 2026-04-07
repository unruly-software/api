import { QueryClient } from '@tanstack/react-query';
import { APIClient, defineAPI } from '@unruly-software/api-client';
import { beforeEach, describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import {
  type APIMutationOptions,
  type APIQueryOptions,
  defineAPIQueryKeys,
  type MountAPIQueryClientOptions,
  mountAPIQueryClient,
  queryKey,
} from './index';

// Skip all tests in this file — they're type-only assertions, not runtime checks.
beforeEach((t) => {
  t.skip();
});

type QueryKeyItem = string | number | boolean | object | null | undefined;

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  authorId: z.number(),
});

const testDefinition = {
  // Endpoint with no request data
  health: api.defineEndpoint({
    metadata: { path: '/health', method: 'GET' },
    request: null,
    response: z.object({ status: z.literal('ok') }),
  }),

  // Endpoint with request and response
  getUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'GET' },
    request: z.object({ userId: z.number() }),
    response: UserSchema,
  }),

  // Endpoint with transform
  getUserWithTransform: api.defineEndpoint({
    metadata: { path: '/users/:id/transform', method: 'GET' },
    request: z.object({ userId: z.number().transform((n) => n.toString()) }),
    response: z.object({
      userId: z.string(),
      name: z.string(),
    }),
  }),

  // Create endpoint
  createUser: api.defineEndpoint({
    metadata: { path: '/users', method: 'POST' },
    request: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    response: UserSchema,
  }),

  // Update endpoint
  updateUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'PUT' },
    request: z.object({
      userId: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional(),
    }),
    response: UserSchema,
  }),

  // Delete endpoint with no response
  deleteUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'DELETE' },
    request: z.object({ userId: z.number() }),
    response: null,
  }),

  // Complex nested endpoint
  getUserPosts: api.defineEndpoint({
    metadata: { path: '/users/:id/posts', method: 'GET' },
    request: z.object({
      userId: z.number(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
    response: z.object({
      posts: z.array(PostSchema),
      total: z.number(),
    }),
  }),
} as const;

type TestAPI = typeof testDefinition;

const queryClient = new QueryClient();
const apiClient = new APIClient(testDefinition, {
  resolver: async () => ({}),
});

const config = defineAPIQueryKeys(testDefinition, {
  health: () => queryKey('health'),
  getUser: (request) => queryKey('user', request?.userId),
});

const testMountOptions: MountAPIQueryClientOptions<TestAPI> = {
  endpoints: {
    health: {
      queryOptions: {
        staleTime: 5000,
        gcTime: 10000,
      },
    },
    getUser: {
      invalidates: () => [['users']],
      queryOptions: {
        enabled: true,
        staleTime: 60000,
      },
    },
    createUser: {
      invalidates: ({ response }) => [['users'], ['user', response.id]],
      mutationOptions: {
        onSuccess: (data) => {
          expectTypeOf(data).toEqualTypeOf<{
            id: number;
            name: string;
            email: string;
          }>();
        },
      },
    },
    updateUser: {
      errorInvalidates: ({ request }) => [['user', request.userId]],
    },
  },
};

const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
  apiClient,
  queryClient,
  queryKeys: config,
  ...testMountOptions,
});

describe('Type Tests for API Query Integration', () => {
  describe('MountAPIQueryClientOptions type', () => {
    it('should properly type configuration options', () => {
      expectTypeOf(testMountOptions).toMatchTypeOf<
        MountAPIQueryClientOptions<TestAPI>
      >();

      // Verify specific configuration typing
      expectTypeOf(
        testMountOptions.endpoints?.createUser?.invalidates,
      ).toMatchTypeOf<
        | ((input: {
            request: { name: string; email: string };
            response: { id: number; name: string; email: string };
          }) => readonly (readonly QueryKeyItem[])[])
        | undefined
      >();

      expectTypeOf(
        testMountOptions.endpoints?.updateUser?.errorInvalidates,
      ).toMatchTypeOf<
        | ((input: {
            request: { userId: number; name?: string; email?: string };
            error: Error;
          }) => readonly (readonly QueryKeyItem[])[])
        | undefined
      >();
    });
  });

  describe('useAPIQuery hook types', () => {
    it('should correctly type query with required request data', () => {
      const getUserQuery = useAPIQuery('getUser', {
        data: { userId: 123 },
      });

      expectTypeOf(getUserQuery.data).toEqualTypeOf<
        { id: number; name: string; email: string } | undefined
      >();
      expectTypeOf(getUserQuery.error).toEqualTypeOf<Error | null>();
      expectTypeOf(getUserQuery.isLoading).toEqualTypeOf<boolean>();
      expectTypeOf(getUserQuery.isError).toEqualTypeOf<boolean>();
    });

    it('should correctly type query with null request data', () => {
      const healthQuery = useAPIQuery('health');
      const healthQueryWithData = useAPIQuery('health', { data: null });

      expectTypeOf(healthQuery.data).toEqualTypeOf<
        { status: 'ok' } | undefined
      >();
      expectTypeOf(healthQueryWithData.data).toEqualTypeOf<
        { status: 'ok' } | undefined
      >();
    });

    it('should correctly type query with conditional data', () => {
      const conditionalQuery = useAPIQuery('getUser', {
        data: null, // Disables query
        overrides: {
          enabled: false,
        },
      });

      expectTypeOf(conditionalQuery.data).toEqualTypeOf<
        { id: number; name: string; email: string } | undefined
      >();
    });

    it('should correctly type query with transforms', () => {
      const transformQuery = useAPIQuery('getUserWithTransform', {
        data: { userId: 123 }, // Input is number
      });

      expectTypeOf(transformQuery.data).toEqualTypeOf<
        { userId: string; name: string } | undefined // Output userId is string
      >();
    });

    it('should correctly type complex nested responses', () => {
      const postsQuery = useAPIQuery('getUserPosts', {
        data: { userId: 1, limit: 10 },
      });

      expectTypeOf(postsQuery.data).toEqualTypeOf<
        | {
            posts: Array<{
              id: number;
              title: string;
              content: string;
              authorId: number;
            }>;
            total: number;
          }
        | undefined
      >();
    });

    it('should correctly type APIQueryOptions', () => {
      type GetUserOptions = APIQueryOptions<typeof testDefinition.getUser>;

      expectTypeOf<GetUserOptions>().toMatchTypeOf<{
        data: { userId: number } | null;
        overrides?: any;
      }>();

      type HealthOptions = APIQueryOptions<typeof testDefinition.health>;

      expectTypeOf<HealthOptions>().toMatchTypeOf<{
        data?: null;
        overrides?: any;
      }>();
    });

    it('should enforce type safety at compile time', () => {
      // @ts-expect-error
      useAPIQuery('getUser');
      // @ts-expect-error
      useAPIQuery('getUser', { data: { userId: 'invalid' } });
      // @ts-expect-error
      useAPIQuery('getUser', { data: { userId: 123, extra: 'prop' } });
      // @ts-expect-error
      useAPIQuery('nonExistentEndpoint', { data: {} });
    });
  });

  describe('useAPIMutation hook types', () => {
    it('should correctly type mutation with request and response', () => {
      const createUserMutation = useAPIMutation('createUser');

      // Check mutate function type matches expected signature
      expectTypeOf(createUserMutation.mutate).toMatchTypeOf<
        (variables: { name: string; email: string }) => void
      >();

      expectTypeOf(createUserMutation.mutateAsync).toMatchTypeOf<
        (variables: { name: string; email: string }) => Promise<{
          id: number;
          name: string;
          email: string;
        }>
      >();

      expectTypeOf(createUserMutation.data).toEqualTypeOf<
        { id: number; name: string; email: string } | undefined
      >();
    });

    it('should correctly type mutation with null response', () => {
      const deleteUserMutation = useAPIMutation('deleteUser');

      expectTypeOf(deleteUserMutation.mutate).toMatchTypeOf<
        (variables: { userId: number }) => void
      >();

      expectTypeOf(deleteUserMutation.mutateAsync).toMatchTypeOf<
        (variables: { userId: number }) => Promise<void>
      >();

      expectTypeOf(deleteUserMutation.data).toEqualTypeOf<void | undefined>();
    });

    it('should correctly type mutation with optional request fields', () => {
      const updateUserMutation = useAPIMutation('updateUser');

      expectTypeOf(updateUserMutation.mutate).toMatchTypeOf<
        (variables: { userId: number; name?: string; email?: string }) => void
      >();
    });

    it('should correctly type APIMutationOptions', () => {
      type CreateUserMutationOptions = APIMutationOptions<
        typeof testDefinition.createUser
      >;

      expectTypeOf<CreateUserMutationOptions>().toMatchTypeOf<{
        overrides?: any;
      }>();
    });

    it('should correctly type mutation callbacks', () => {
      const mutationWithCallbacks = useAPIMutation('createUser', {
        overrides: {
          onSuccess: (data, variables, context) => {
            expectTypeOf(data).toEqualTypeOf<{
              id: number;
              name: string;
              email: string;
            }>();
            expectTypeOf(variables).toEqualTypeOf<{
              name: string;
              email: string;
            }>();
            expectTypeOf(context).toEqualTypeOf<unknown>();
          },
          onError: (error, variables, context) => {
            expectTypeOf(error).toEqualTypeOf<Error>();
            expectTypeOf(variables).toEqualTypeOf<{
              name: string;
              email: string;
            }>();
            expectTypeOf(context).toEqualTypeOf<unknown>();
          },
        },
      });

      expectTypeOf(mutationWithCallbacks).not.toBeAny();
    });

    it('should enforce type safety for mutations', () => {
      // These should cause TypeScript errors:

      const mutation = useAPIMutation('createUser');

      // @ts-expect-error
      mutation.mutate({ name: 123, email: 'test@test.com' });
      // @ts-expect-error
      mutation.mutate({ name: 'test' });
      // @ts-expect-error
      mutation.mutate({ name: 'test', email: 'test@test.com', extra: 'field' });

      mutation.mutate({ name: 'test', email: 'test@test.com' });
    });
  });

  describe('mountAPIQueryClient types', () => {
    it('should correctly type the returned hooks', () => {
      const { useAPIQuery: query, useAPIMutation: mutation } =
        mountAPIQueryClient({
          apiClient,
          queryClient,
          queryKeys: config,
          ...testMountOptions,
        });

      expectTypeOf(query).toMatchTypeOf<typeof useAPIQuery>();
      expectTypeOf(mutation).toMatchTypeOf<typeof useAPIMutation>();
    });

    it('should enforce config type compatibility', () => {
      // This should work fine
      const validOptions: MountAPIQueryClientOptions<TestAPI> = {
        endpoints: {
          getUser: {
            invalidates: () => [['users']],
          },
        },
      };

      expectTypeOf(validOptions).toMatchTypeOf<
        MountAPIQueryClientOptions<TestAPI>
      >();

      const _invalidOptions: MountAPIQueryClientOptions<TestAPI> = {
        endpoints: {
          // @ts-expect-error
          nonExistentEndpoint: {
            invalidates: () => [['test']],
          },
        },
      };
    });
  });

  describe('Type inference edge cases', () => {
    it('should handle endpoints with no request or response', () => {
      const noDataEndpoint = api.defineEndpoint({
        metadata: { path: '/ping', method: 'POST' },
        request: null,
        response: null,
      });

      const definition = { ping: noDataEndpoint };
      const pingConfig = defineAPIQueryKeys(definition, {});
      const { useAPIQuery: pingQuery, useAPIMutation: pingMutation } =
        mountAPIQueryClient({
          apiClient: new APIClient(definition, { resolver: async () => null }),
          queryClient: new QueryClient(),
          queryKeys: pingConfig,
        });

      const query = pingQuery('ping');
      const mutation = pingMutation('ping');

      expectTypeOf(query.data).toMatchTypeOf<undefined>();
      expectTypeOf(mutation.data).toMatchTypeOf<void | undefined>();
    });

    it('should handle complex union types', () => {
      const unionEndpoint = api.defineEndpoint({
        metadata: { path: '/union', method: 'GET' },
        request: z.object({ type: z.union([z.literal('a'), z.literal('b')]) }),
        response: z.union([
          z.object({ type: z.literal('a'), valueA: z.string() }),
          z.object({ type: z.literal('b'), valueB: z.number() }),
        ]),
      });

      const unionDef = { getUnion: unionEndpoint };
      const unionConfig = defineAPIQueryKeys(unionDef, {});
      const { useAPIQuery: unionQuery } = mountAPIQueryClient({
        apiClient: new APIClient(unionDef, { resolver: async () => ({}) }),
        queryClient: new QueryClient(),
        queryKeys: unionConfig,
      });

      const query = unionQuery('getUnion', {
        data: { type: 'a' },
      });

      expectTypeOf(query.data).toEqualTypeOf<
        | { type: 'a'; valueA: string }
        | { type: 'b'; valueB: number }
        | undefined
      >();
    });
  });
});
