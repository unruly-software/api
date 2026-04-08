import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { APIClient, type APIResolver, type RequestOptions } from './APIClient';
import {
  defineAPI,
  type EndpointDefinition,
  type EndpointInput,
  type EndpointOutput,
} from './endpoint';

describe('APIClient Type Inference', () => {
  describe('defineAPI Type Safety', () => {
    it('should enforce metadata types', () => {
      const apiWithPath = defineAPI<{ path: string }>();
      const apiWithMethod = defineAPI<{
        path: string;
        method: 'GET' | 'POST';
      }>();
      const apiWithAuth = defineAPI<{
        path: string;
        requiresAuth: boolean;
        tags: string[];
      }>();

      const pathEndpoint = apiWithPath.defineEndpoint({
        request: z.object({ id: z.number() }),
        response: z.object({ name: z.string() }),
        metadata: { path: '/users' },
      });

      expectTypeOf(pathEndpoint.metadata).toEqualTypeOf<{ path: string }>();

      const methodEndpoint = apiWithMethod.defineEndpoint({
        request: null,
        response: z.object({ status: z.string() }),
        metadata: { path: '/health', method: 'GET' },
      });

      expectTypeOf(methodEndpoint.metadata).toEqualTypeOf<{
        path: string;
        method: 'GET' | 'POST';
      }>();

      const authEndpoint = apiWithAuth.defineEndpoint({
        request: z.object({ userId: z.string() }),
        response: z.object({ profile: z.object({ name: z.string() }) }),
        metadata: {
          path: '/profile',
          requiresAuth: true,
          tags: ['user', 'profile'],
        },
      });

      expectTypeOf(authEndpoint.metadata).toEqualTypeOf<{
        path: string;
        requiresAuth: boolean;
        tags: string[];
      }>();
    });

    it('should infer endpoint input and output types', () => {
      const api = defineAPI<{ path: string }>();

      const complexEndpoint = api.defineEndpoint({
        request: z.object({
          user: z.object({
            name: z.string(),
            email: z.string().email(),
            preferences: z.array(z.enum(['email', 'sms'])),
          }),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
        response: z.discriminatedUnion('status', [
          z.object({
            status: z.literal('success'),
            user: z.object({
              id: z.string().uuid(),
              name: z.string(),
              email: z.string(),
            }),
          }),
          z.object({
            status: z.literal('error'),
            message: z.string(),
            code: z.number(),
          }),
        ]),
        metadata: { path: '/users' },
      });

      type ExpectedInput = {
        user: {
          name: string;
          email: string;
          preferences: ('email' | 'sms')[];
        };
        metadata?: Record<string, unknown>;
      };

      type ExpectedOutput =
        | {
            status: 'success';
            user: {
              id: string;
              name: string;
              email: string;
            };
          }
        | {
            status: 'error';
            message: string;
            code: number;
          };

      expectTypeOf<
        EndpointInput<typeof complexEndpoint>
      >().toEqualTypeOf<ExpectedInput>();
      expectTypeOf<
        EndpointOutput<typeof complexEndpoint>
      >().toEqualTypeOf<ExpectedOutput>();
    });

    it('should handle null request schemas correctly', () => {
      const api = defineAPI<{ path: string }>();

      const noRequestEndpoint = api.defineEndpoint({
        request: null,
        response: z.object({ timestamp: z.number() }),
        metadata: { path: '/timestamp' },
      });

      expectTypeOf<
        EndpointInput<typeof noRequestEndpoint>
      >().toEqualTypeOf<never>();
      expectTypeOf<EndpointOutput<typeof noRequestEndpoint>>().toEqualTypeOf<{
        timestamp: number;
      }>();
    });
  });

  describe('APIClient Constructor and Resolver Types', () => {
    it('should type the resolver function correctly', () => {
      const api = defineAPI<{ path: string; method: string }>();

      const definitions = {
        getUser: api.defineEndpoint({
          request: z.object({ id: z.number() }),
          response: z.object({ name: z.string(), email: z.string() }),
          metadata: { path: '/users/:id', method: 'GET' },
        }),
        createUser: api.defineEndpoint({
          request: z.object({ name: z.string(), email: z.string() }),
          response: z.object({
            id: z.number(),
            name: z.string(),
            email: z.string(),
          }),
          metadata: { path: '/users', method: 'POST' },
        }),
        deleteUser: api.defineEndpoint({
          request: null,
          response: z.object({ success: z.boolean() }),
          metadata: { path: '/users/:id', method: 'DELETE' },
        }),
      };

      type ExpectedDefinitions = typeof definitions;

      const resolver: APIResolver<ExpectedDefinitions> = async ({
        endpoint,
        definition,
        request,
        abortSignal,
      }) => {
        expectTypeOf(endpoint).toEqualTypeOf<
          'getUser' | 'createUser' | 'deleteUser'
        >();
        expectTypeOf(definition.metadata).toEqualTypeOf<{
          path: string;
          method: string;
        }>();
        expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal | undefined>();

        if (endpoint === 'getUser') {
          expectTypeOf(request).toEqualTypeOf<{ id: number }>();
          expectTypeOf(definition).toEqualTypeOf<
            EndpointDefinition<
              z.ZodObject<{ id: z.ZodNumber }>,
              z.ZodObject<{ name: z.ZodString; email: z.ZodString }>,
              { path: string; method: string }
            >
          >();
          return { name: 'John', email: 'john@example.com' };
        }

        if (endpoint === 'createUser') {
          expectTypeOf(request).toEqualTypeOf<{
            name: string;
            email: string;
          }>();
          return { id: 1, name: request.name, email: request.email };
        }

        if (endpoint === 'deleteUser') {
          expectTypeOf(request).toEqualTypeOf<never>();
          return { success: true };
        }

        return {};
      };

      const client = new APIClient(definitions, { resolver });

      expectTypeOf(client).toEqualTypeOf<APIClient<typeof definitions>>();
    });

    it('should enforce correct resolver return types', () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        endpoint1: api.defineEndpoint({
          request: z.object({ input: z.string() }),
          response: z.object({ output: z.number() }),
          metadata: { path: '/test' },
        }),
      };

      // This resolver should be typed correctly
      const validResolver: APIResolver<typeof definitions> = async ({
        endpoint,
        request,
      }) => {
        if (endpoint === 'endpoint1') {
          expectTypeOf(request).toEqualTypeOf<{ input: string }>();
          // The resolver can return unknown, which will be validated by the response schema
          return { output: 42 };
        }
        return {};
      };

      expectTypeOf(validResolver).toMatchTypeOf<
        APIResolver<typeof definitions>
      >();
    });
  });

  describe('Request Method Type Safety', () => {
    beforeEach((t) => {
      // This is a type test
      t.skip();
    });

    it('should require request parameter when endpoint expects data', () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        withRequest: api.defineEndpoint({
          request: z.object({ name: z.string() }),
          response: z.object({ id: z.number() }),
          metadata: { path: '/create' },
        }),
        withoutRequest: api.defineEndpoint({
          request: null,
          response: z.object({ status: z.string() }),
          metadata: { path: '/status' },
        }),
        optionalRequest: api.defineEndpoint({
          request: z.object({ filter: z.string().optional() }).optional(),
          response: z.object({ results: z.array(z.string()) }),
          metadata: { path: '/search' },
        }),
      };

      const client = new APIClient(definitions, {
        resolver: async () => ({}),
      });

      // Should require request parameter for endpoints with required request data
      expectTypeOf(client.request)
        .parameter(0)
        .toEqualTypeOf<'withRequest' | 'withoutRequest' | 'optionalRequest'>();

      // @ts-expect-error Must provide request data for 'withRequest' endpoint
      client.request('withRequest');
      client.request('withRequest', {
        request: {
          name: 'Test',
        },
      });
      client.request('withRequest', {
        request: {
          // @ts-expect-error Must be the correct shape
          name: 123,
        },
      });

      // Should allow omitting request parameter for endpoints without request data
      client.request('withoutRequest');
      client.request('withoutRequest', { request: undefined });
      client.request('withoutRequest', {});

      // @ts-expect-error Cannot skip request parameter for 'optionalRequest' endpoint, but request can be undefined
      client.request('optionalRequest');
      client.request('optionalRequest', { request: undefined });
      // @ts-expect-error Ideally this should not be required
      client.request('optionalRequest', {});
      client.request('optionalRequest', { request: { filter: 'test' } });

      // @ts-expect-error Cannot provide an invalid request name
      client.request('notCorrect', { request: null as any });

      expectTypeOf<
        Parameters<typeof client.request<'withRequest'>>
      >().toEqualTypeOf<
        [
          endpoint: 'withRequest',
          options: {
            abort?: AbortSignal | undefined;
          } & {
            request: {
              name: string;
            };
          },
        ]
      >();

      expectTypeOf<
        Parameters<typeof client.request<'withoutRequest'>>
      >().toEqualTypeOf<
        [
          endpoint: 'withoutRequest',
          options?: {
            abort?: AbortSignal | undefined;
          } & {
            request?: never;
          },
        ]
      >();

      expectTypeOf<
        Parameters<typeof client.request<'optionalRequest'>>
      >().toEqualTypeOf<
        [
          endpoint: 'optionalRequest',
          options: {
            abort?: AbortSignal | undefined;
          } & {
            request:
              | {
                  filter?: string | undefined;
                }
              | undefined;
          },
        ]
      >();
    });

    it('should infer return types correctly', () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        getString: api.defineEndpoint({
          request: null,
          response: z.string(),
          metadata: { path: '/string' },
        }),
        getNumber: api.defineEndpoint({
          request: z.object({ multiplier: z.number() }),
          response: z.number(),
          metadata: { path: '/number' },
        }),
        getComplex: api.defineEndpoint({
          request: z.object({ query: z.string() }),
          response: z.object({
            results: z.array(
              z.object({
                id: z.string(),
                data: z.record(z.string(), z.unknown()),
              }),
            ),
            pagination: z.object({
              page: z.number(),
              total: z.number(),
              hasMore: z.boolean(),
            }),
          }),
          metadata: { path: '/search' },
        }),
      };

      const client = new APIClient(definitions, {
        resolver: async () => ({}),
      });

      expectTypeOf(client.request('getString')).toEqualTypeOf<
        Promise<string>
      >();

      expectTypeOf(
        client.request('getNumber', {
          request: { multiplier: 5 },
        }),
      ).toEqualTypeOf<Promise<number>>();

      expectTypeOf(
        client.request('getComplex', {
          request: { query: 'test' },
        }),
      ).toEqualTypeOf<
        Promise<{
          results: Array<{
            id: string;
            data: Record<string, unknown>;
          }>;
          pagination: {
            page: number;
            total: number;
            hasMore: boolean;
          };
        }>
      >();
    });

    it('should handle optional request properties correctly', async () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        optionalProps: api.defineEndpoint({
          request: z.object({
            required: z.string(),
            optional: z.string().optional(),
            nullable: z.string().nullable(),
            defaulted: z.string().default('default'),
          }),
          response: z.object({ received: z.record(z.string(), z.unknown()) }),
          metadata: { path: '/optional' },
        }),
      };

      const client = new APIClient(definitions, {
        resolver: async () => ({ received: {} }),
      });

      // Test type inference without executing
      expectTypeOf<
        ReturnType<typeof client.request<'optionalProps'>>
      >().toEqualTypeOf<Promise<{ received: Record<string, unknown> }>>();

      // Test actual requests with proper handling
      const result1 = await client.request('optionalProps', {
        request: { required: 'value', nullable: null },
      });
      expect(result1).toEqual({ received: {} });

      const result2 = await client.request('optionalProps', {
        request: {
          required: 'value',
          optional: 'optional',
          nullable: null,
          defaulted: 'custom',
        },
      });
      expect(result2).toEqual({ received: {} });
    });
  });

  describe('RequestOptions Type Safety', () => {
    it('should type RequestOptions correctly for different endpoint types', () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        withData: api.defineEndpoint({
          request: z.object({ data: z.string() }),
          response: z.object({ result: z.string() }),
          metadata: { path: '/with-data' },
        }),
        withoutData: api.defineEndpoint({
          request: null,
          response: z.object({ status: z.string() }),
          metadata: { path: '/without-data' },
        }),
      };

      // RequestOptions for endpoint with required data
      expectTypeOf<RequestOptions<typeof definitions.withData>>().toEqualTypeOf<
        {
          abort?: AbortSignal;
        } & {
          request: { data: string };
        }
      >();

      // RequestOptions for endpoint without data
      expectTypeOf<
        RequestOptions<typeof definitions.withoutData>
      >().toEqualTypeOf<
        {
          abort?: AbortSignal;
        } & {
          request?: never;
        }
      >();
    });

    it('should handle AbortSignal correctly', () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        test: api.defineEndpoint({
          request: z.object({ input: z.string() }),
          response: z.object({ output: z.string() }),
          metadata: { path: '/test' },
        }),
      };

      const client = new APIClient(definitions, {
        resolver: async ({ abortSignal }) => {
          expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal | undefined>();
          return { output: 'test' };
        },
      });

      const controller = new AbortController();

      expectTypeOf(
        client.request('test', {
          request: { input: 'test' },
          abort: controller.signal,
        }),
      ).toEqualTypeOf<Promise<{ output: string }>>();
    });
  });

  describe('Complex Nested Type Inference', () => {
    it('should handle deeply nested schemas', () => {
      const api = defineAPI<{ path: string; version: number }>();

      const nestedSchema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              data: z.array(
                z.object({
                  id: z.string().uuid(),
                  attributes: z.record(
                    z.string(),
                    z.union([z.string(), z.number(), z.boolean()]),
                  ),
                  relationships: z.object({
                    parent: z.string().uuid().optional(),
                    children: z.array(z.string().uuid()),
                  }),
                }),
              ),
              metadata: z.object({
                total: z.number(),
                processed: z.number(),
                errors: z.array(
                  z.object({
                    code: z.string(),
                    message: z.string(),
                    path: z.array(z.union([z.string(), z.number()])),
                  }),
                ),
              }),
            }),
          }),
        }),
      });

      const definitions = {
        complexNested: api.defineEndpoint({
          request: nestedSchema,
          response: z.object({
            success: z.boolean(),
            processedItems: z.number(),
            summary: z.object({
              created: z.number(),
              updated: z.number(),
              failed: z.number(),
            }),
          }),
          metadata: { path: '/complex', version: 1 },
        }),
      };

      const client = new APIClient(definitions, {
        resolver: async ({ request, definition }) => {
          expectTypeOf(request).toEqualTypeOf<z.infer<typeof nestedSchema>>();
          expectTypeOf(definition.metadata).toEqualTypeOf<{
            path: string;
            version: number;
          }>();

          return {
            success: true,
            processedItems: request.level1.level2.level3.data.length,
            summary: { created: 1, updated: 0, failed: 0 },
          };
        },
      });

      expectTypeOf(
        client.request('complexNested', {
          request: {
            level1: {
              level2: {
                level3: {
                  data: [
                    {
                      id: '123e4567-e89b-12d3-a456-426614174000',
                      attributes: { name: 'test', count: 5, active: true },
                      relationships: { children: [] },
                    },
                  ],
                  metadata: {
                    total: 1,
                    processed: 1,
                    errors: [],
                  },
                },
              },
            },
          },
        }),
      ).toEqualTypeOf<
        Promise<{
          success: boolean;
          processedItems: number;
          summary: {
            created: number;
            updated: number;
            failed: number;
          };
        }>
      >();
    });

    it('should handle union and discriminated union types', () => {
      const api = defineAPI<{ path: string }>();

      const definitions = {
        unionResponse: api.defineEndpoint({
          request: z.object({ type: z.enum(['user', 'admin', 'guest']) }),
          response: z.discriminatedUnion('type', [
            z.object({
              type: z.literal('user'),
              profile: z.object({
                name: z.string(),
                email: z.string(),
                preferences: z.record(z.string(), z.boolean()),
              }),
            }),
            z.object({
              type: z.literal('admin'),
              profile: z.object({
                name: z.string(),
                permissions: z.array(z.string()),
                lastLogin: z.string().datetime(),
              }),
            }),
            z.object({
              type: z.literal('guest'),
              sessionId: z.string(),
              expiresAt: z.string().datetime(),
            }),
          ]),
          metadata: { path: '/auth' },
        }),
      };

      const client = new APIClient(definitions, {
        resolver: async ({ request }) => {
          if (request.type === 'user') {
            return {
              type: 'user',
              profile: {
                name: 'John',
                email: 'john@example.com',
                preferences: {},
              },
            };
          }
          if (request.type === 'admin') {
            return {
              type: 'admin',
              profile: {
                name: 'Admin',
                permissions: ['read', 'write'],
                lastLogin: new Date().toISOString(),
              },
            };
          }
          return {
            type: 'guest',
            sessionId: 'session123',
            expiresAt: new Date().toISOString(),
          };
        },
      });

      type ExpectedResponse =
        | {
            type: 'user';
            profile: {
              name: string;
              email: string;
              preferences: Record<string, boolean>;
            };
          }
        | {
            type: 'admin';
            profile: {
              name: string;
              permissions: string[];
              lastLogin: string;
            };
          }
        | {
            type: 'guest';
            sessionId: string;
            expiresAt: string;
          };

      expectTypeOf(
        client.request('unionResponse', {
          request: { type: 'user' as const },
        }),
      ).toEqualTypeOf<Promise<ExpectedResponse>>();
    });
  });

  describe('Generic Type Constraints', () => {
    it('should enforce proper type constraints in definitions', () => {
      type CustomMetadata = {
        path: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        auth: boolean;
        rateLimit: number;
      };

      const api = defineAPI<CustomMetadata>();

      const endpoint = api.defineEndpoint({
        request: z.object({ id: z.string() }),
        response: z.object({ data: z.unknown() }),
        metadata: {
          path: '/test',
          method: 'GET',
          auth: true,
          rateLimit: 100,
        },
      });

      expectTypeOf(endpoint).toEqualTypeOf<
        EndpointDefinition<
          z.ZodObject<{ id: z.ZodString }>,
          z.ZodObject<{ data: z.ZodUnknown }>,
          CustomMetadata
        >
      >();

      expectTypeOf(endpoint.metadata).toEqualTypeOf<CustomMetadata>();
      expectTypeOf(endpoint.metadata.method).toEqualTypeOf<
        'GET' | 'POST' | 'PUT' | 'DELETE'
      >();
      expectTypeOf(endpoint.metadata.auth).toEqualTypeOf<boolean>();
    });
  });
});
