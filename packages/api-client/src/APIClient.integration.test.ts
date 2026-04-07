import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { APIClient } from './APIClient';
import { defineAPI } from './endpoint';

describe('APIClient Integration and Edge Cases', () => {
  describe('Real-World API Scenarios', () => {
    const api = defineAPI<{
      path: string;
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      auth?: boolean;
      rateLimit?: number;
    }>();

    const userSchema = z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      email: z.string().email(),
      avatar: z.string().url().optional(),
      roles: z.array(z.enum(['admin', 'user', 'moderator'])),
      preferences: z.object({
        theme: z.enum(['light', 'dark', 'auto']),
        notifications: z.object({
          email: z.boolean(),
          push: z.boolean(),
          sms: z.boolean(),
        }),
        language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
      }),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });

    const paginationSchema = z.object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1).max(100),
      total: z.number().int().min(0),
      hasMore: z.boolean(),
    });

    const realWorldAPI = {
      // CRUD operations
      getUsers: api.defineEndpoint({
        request: z.object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
          roles: z.array(z.enum(['admin', 'user', 'moderator'])).optional(),
          sortBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
          sortOrder: z.enum(['asc', 'desc']).default('desc'),
        }),
        response: z.object({
          users: z.array(userSchema),
          pagination: paginationSchema,
        }),
        metadata: { path: '/users', method: 'GET', rateLimit: 100 },
      }),

      getUserById: api.defineEndpoint({
        request: z.object({
          id: z.string().uuid(),
          includeMetadata: z.boolean().default(false),
        }),
        response: z.discriminatedUnion('status', [
          z.object({
            status: z.literal('success'),
            user: userSchema,
          }),
          z.object({
            status: z.literal('not_found'),
            message: z.string(),
          }),
        ]),
        metadata: { path: '/users/:id', method: 'GET', rateLimit: 200 },
      }),

      createUser: api.defineEndpoint({
        request: z.object({
          name: z.string().min(1).max(100),
          email: z.string().email(),
          password: z.string().min(8).max(128),
          roles: z
            .array(z.enum(['admin', 'user', 'moderator']))
            .default(['user']),
          preferences: z
            .object({
              theme: z.enum(['light', 'dark', 'auto']).default('auto'),
              notifications: z
                .object({
                  email: z.boolean().default(true),
                  push: z.boolean().default(true),
                  sms: z.boolean().default(false),
                })
                .default({
                  email: true,
                  push: true,
                  sms: true,
                }),
              language: z
                .string()
                .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
                .default('en'),
            })
            .default({
              language: 'en',
              theme: 'auto',
              notifications: { email: true, push: true, sms: false },
            }),
        }),
        response: z.discriminatedUnion('status', [
          z.object({
            status: z.literal('created'),
            user: userSchema.omit({ metadata: true }),
            token: z.string(),
          }),
          z.object({
            status: z.literal('conflict'),
            message: z.string(),
            field: z.enum(['email', 'name']),
          }),
          z.object({
            status: z.literal('validation_error'),
            errors: z.array(
              z.object({
                field: z.string(),
                code: z.string(),
                message: z.string(),
              }),
            ),
          }),
        ]),
        metadata: { path: '/users', method: 'POST', auth: false },
      }),

      updateUser: api.defineEndpoint({
        request: z.object({
          id: z.string().uuid(),
          updates: z.object({
            name: z.string().min(1).max(100).optional(),
            email: z.string().email().optional(),
            avatar: z.string().url().optional(),
            preferences: z
              .object({
                theme: z.enum(['light', 'dark', 'auto']).optional(),
                notifications: z
                  .object({
                    email: z.boolean().optional(),
                    push: z.boolean().optional(),
                    sms: z.boolean().optional(),
                  })
                  .optional(),
                language: z
                  .string()
                  .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
                  .optional(),
              })
              .optional(),
          }),
        }),
        response: z.discriminatedUnion('status', [
          z.object({
            status: z.literal('updated'),
            user: userSchema,
          }),
          z.object({
            status: z.literal('not_found'),
            message: z.string(),
          }),
          z.object({
            status: z.literal('forbidden'),
            message: z.string(),
          }),
        ]),
        metadata: { path: '/users/:id', method: 'PATCH', auth: true },
      }),

      // Batch operations
      batchUpdateUsers: api.defineEndpoint({
        request: z.object({
          updates: z
            .array(
              z.object({
                id: z.string().uuid(),
                data: z.object({
                  roles: z
                    .array(z.enum(['admin', 'user', 'moderator']))
                    .optional(),
                  metadata: z.record(z.string(), z.unknown()).optional(),
                }),
              }),
            )
            .min(1)
            .max(50),
        }),
        response: z.object({
          results: z.array(
            z.discriminatedUnion('status', [
              z.object({
                status: z.literal('success'),
                id: z.string().uuid(),
                user: userSchema,
              }),
              z.object({
                status: z.literal('error'),
                id: z.string().uuid(),
                error: z.string(),
              }),
            ]),
          ),
          summary: z.object({
            total: z.number(),
            successful: z.number(),
            failed: z.number(),
          }),
        }),
        metadata: { path: '/users/batch', method: 'PATCH', auth: true },
      }),

      // File upload
      uploadAvatar: api.defineEndpoint({
        request: z.object({
          userId: z.string().uuid(),
          file: z.instanceof(File),
          resize: z
            .object({
              width: z.number().int().min(50).max(1000),
              height: z.number().int().min(50).max(1000),
              quality: z.number().min(0.1).max(1).default(0.8),
            })
            .optional(),
        }),
        response: z.object({
          avatarUrl: z.string().url(),
          metadata: z.object({
            size: z.number(),
            mimeType: z.string(),
            dimensions: z.object({
              width: z.number(),
              height: z.number(),
            }),
          }),
        }),
        metadata: { path: '/users/:userId/avatar', method: 'POST', auth: true },
      }),

      // Analytics endpoint with complex filters
      getUserAnalytics: api.defineEndpoint({
        request: z.object({
          dateRange: z.object({
            start: z.string().datetime(),
            end: z.string().datetime(),
          }),
          filters: z
            .object({
              userIds: z.array(z.string().uuid()).optional(),
              roles: z.array(z.enum(['admin', 'user', 'moderator'])).optional(),
              countries: z.array(z.string().length(2)).optional(),
              devices: z
                .array(z.enum(['desktop', 'mobile', 'tablet']))
                .optional(),
            })
            .optional(),
          groupBy: z.array(z.enum(['day', 'week', 'month', 'role', 'country'])),
          metrics: z.array(
            z.enum([
              'active_users',
              'page_views',
              'session_duration',
              'conversion_rate',
            ]),
          ),
        }),
        response: z.object({
          data: z.array(
            z.object({
              dimensions: z.record(z.string(), z.string()),
              metrics: z.record(z.string(), z.number()),
              timestamp: z.string().datetime().optional(),
            }),
          ),
          totals: z.record(z.string(), z.number()),
          metadata: z.object({
            generated: z.string().datetime(),
            queryTime: z.number(),
            cached: z.boolean(),
          }),
        }),
        metadata: {
          path: '/analytics/users',
          method: 'POST',
          auth: true,
          rateLimit: 10,
        },
      }),
    };

    it('should handle complex real-world API operations with full type safety', async () => {
      const mockUsers = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'John Doe',
          email: 'john@example.com',
          avatar: 'https://example.com/avatar1.jpg',
          roles: ['user', 'moderator'] as const,
          preferences: {
            theme: 'dark' as const,
            notifications: { email: true, push: true, sms: false },
            language: 'en-US',
          },
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-06-01T00:00:00Z',
          metadata: { department: 'engineering', level: 'senior' },
        },
      ];

      const client = new APIClient(realWorldAPI, {
        resolver: async ({ endpoint, request, definition }) => {
          expectTypeOf(definition.metadata.path).toEqualTypeOf<string>();
          expectTypeOf(definition.metadata.method).toEqualTypeOf<
            'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
          >();

          if (endpoint === 'getUsers') {
            // This is only called once, so this tests that we're actually
            // serializing the request before sending and not passing directly
            // from the unparsed client request
            expect(request.page).not.toBeUndefined();
            expect(request.page).toBe(1); // Default value
            expect(request.limit).not.toBeUndefined();
            expect(request.limit).toBe(20); // Default value
            expectTypeOf(request).toEqualTypeOf<{
              page: number;
              limit: number;
              search?: string;
              roles?: ('admin' | 'user' | 'moderator')[];
              sortBy: 'name' | 'email' | 'createdAt';
              sortOrder: 'asc' | 'desc';
            }>();

            return {
              users: mockUsers,
              pagination: {
                page: request.page,
                limit: request.limit,
                total: 1,
                hasMore: false,
              },
            };
          }

          if (endpoint === 'getUserById') {
            expectTypeOf(request).toEqualTypeOf<{
              id: string;
              includeMetadata: boolean;
            }>();

            if (request.id === mockUsers[0].id) {
              return {
                status: 'success',
                user: mockUsers[0],
              };
            }

            return {
              status: 'not_found',
              message: 'User not found',
            };
          }

          if (endpoint === 'createUser') {
            expectTypeOf(request).toEqualTypeOf<{
              name: string;
              email: string;
              password: string;
              roles: ('admin' | 'user' | 'moderator')[];
              preferences: {
                theme: 'light' | 'dark' | 'auto';
                notifications: {
                  email: boolean;
                  push: boolean;
                  sms: boolean;
                };
                language: string;
              };
            }>();

            if (request.email === 'existing@example.com') {
              return {
                status: 'conflict',
                message: 'Email already exists',
                field: 'email',
              };
            }

            return {
              status: 'created',
              user: {
                ...mockUsers[0],
                name: request.name,
                email: request.email,
              },
              token: 'jwt-token-here',
            };
          }

          return {};
        },
      });

      // Test complex pagination query
      const usersResponse = await client.request('getUsers', {
        request: {
          // Intentionally omitting page and limit to test default values
          search: 'john',
          roles: ['user', 'moderator'],
          sortBy: 'name',
          sortOrder: 'asc',
        },
      });

      expectTypeOf(usersResponse).toEqualTypeOf<{
        users: Array<{
          id: string;
          name: string;
          email: string;
          avatar?: string;
          roles: ('admin' | 'user' | 'moderator')[];
          preferences: {
            theme: 'light' | 'dark' | 'auto';
            notifications: {
              email: boolean;
              push: boolean;
              sms: boolean;
            };
            language: string;
          };
          createdAt: string;
          updatedAt: string;
          metadata?: Record<string, unknown>;
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          hasMore: boolean;
        };
      }>();

      expect(usersResponse.users).toHaveLength(1);
      expect(usersResponse.pagination.page).toBe(1);

      // Test discriminated union response
      const userResponse = await client.request('getUserById', {
        request: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          includeMetadata: true,
        },
      });

      if (userResponse.status === 'not_found') {
        expectTypeOf(userResponse).toEqualTypeOf<{
          status: 'not_found';
          message: string;
        }>();
      }

      expect(userResponse.status).toBe('success');

      if (userResponse.status === 'success') {
        expect(userResponse.user.name).toBe('John Doe');
      }

      // Test user not found
      const notFoundResponse = await client.request('getUserById', {
        request: {
          id: '00000000-0000-0000-0000-000000000000',
          includeMetadata: false,
        },
      });

      expect(notFoundResponse.status).toBe('not_found');

      if (notFoundResponse.status === 'not_found') {
        expect(notFoundResponse.message).toBe('User not found');
        expectTypeOf(notFoundResponse.message).toEqualTypeOf<string>();
      }

      // Test user creation with conflict
      const conflictResponse = await client.request('createUser', {
        request: {
          name: 'Existing User',
          email: 'existing@example.com',
          password: 'password123',
          roles: ['user'],
          preferences: {
            theme: 'light',
            notifications: { email: true, push: false, sms: false },
            language: 'en',
          },
        },
      });

      expect(conflictResponse.status).toBe('conflict');

      if (conflictResponse.status === 'conflict') {
        expect(conflictResponse.field).toBe('email');
        expectTypeOf(conflictResponse.field).toEqualTypeOf<'email' | 'name'>();
      }
    });

    it('should handle file upload with complex request validation', async () => {
      const mockFile = new File(['mock content'], 'avatar.jpg', {
        type: 'image/jpeg',
      });

      const client = new APIClient(realWorldAPI, {
        resolver: async ({ endpoint, request }) => {
          if (endpoint === 'uploadAvatar') {
            expect(request.file).toBeInstanceOf(File);
            expect(request.userId).toMatch(/^[0-9a-f-]{36}$/i);

            return {
              avatarUrl: 'https://example.com/avatars/new-avatar.jpg',
              metadata: {
                size: request.file.size,
                mimeType: request.file.type,
                dimensions: {
                  width: request.resize?.width || 200,
                  height: request.resize?.height || 200,
                },
              },
            };
          }
          return {};
        },
      });

      const uploadResponse = await client.request('uploadAvatar', {
        request: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          file: mockFile,
          resize: {
            width: 300,
            height: 300,
            quality: 0.9,
          },
        },
      });

      expectTypeOf(uploadResponse).toEqualTypeOf<{
        avatarUrl: string;
        metadata: {
          size: number;
          mimeType: string;
          dimensions: {
            width: number;
            height: number;
          };
        };
      }>();

      expect(uploadResponse.avatarUrl).toMatch(/^https:\/\//);
      expect(uploadResponse.metadata.dimensions).toEqual({
        width: 300,
        height: 300,
      });
    });

    it('should handle complex analytics queries', async () => {
      const client = new APIClient(realWorldAPI, {
        resolver: async ({ endpoint, request }) => {
          if (endpoint === 'getUserAnalytics') {
            expectTypeOf(request).toEqualTypeOf<{
              dateRange: {
                start: string;
                end: string;
              };
              filters?: {
                userIds?: string[];
                roles?: ('admin' | 'user' | 'moderator')[];
                countries?: string[];
                devices?: ('desktop' | 'mobile' | 'tablet')[];
              };
              groupBy: ('day' | 'week' | 'month' | 'role' | 'country')[];
              metrics: (
                | 'active_users'
                | 'page_views'
                | 'session_duration'
                | 'conversion_rate'
              )[];
            }>();

            return {
              data: [
                {
                  dimensions: { role: 'user', country: 'US' },
                  metrics: { active_users: 150, page_views: 1250 },
                  timestamp: '2023-06-01T00:00:00Z',
                },
                {
                  dimensions: { role: 'admin', country: 'US' },
                  metrics: { active_users: 5, page_views: 200 },
                  timestamp: '2023-06-01T00:00:00Z',
                },
              ],
              totals: { active_users: 155, page_views: 1450 },
              metadata: {
                generated: new Date().toISOString(),
                queryTime: 150,
                cached: false,
              },
            };
          }
          return {};
        },
      });

      const analyticsResponse = await client.request('getUserAnalytics', {
        request: {
          dateRange: {
            start: '2023-06-01T00:00:00Z',
            end: '2023-06-30T23:59:59Z',
          },
          filters: {
            roles: ['user', 'admin'],
            countries: ['US', 'CA'],
            devices: ['desktop', 'mobile'],
          },
          groupBy: ['role', 'country'],
          metrics: ['active_users', 'page_views'],
        },
      });

      expectTypeOf(analyticsResponse.data).toEqualTypeOf<
        Array<{
          dimensions: Record<string, string>;
          metrics: Record<string, number>;
          timestamp?: string;
        }>
      >();

      expect(analyticsResponse.data).toHaveLength(2);
      expect(analyticsResponse.totals.active_users).toBe(155);
      expect(analyticsResponse.metadata.cached).toBe(false);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    const api = defineAPI<{ path: string }>();

    // Define nodeSchema for recursive test first
    const nodeSchema: z.ZodType<{
      id: string;
      value: number;
      children?: Array<{
        id: string;
        value: number;
        children?: any;
      }>;
    }> = z.lazy(() =>
      z.object({
        id: z.string(),
        value: z.number(),
        children: z.array(nodeSchema).optional(),
      }),
    );

    const edgeCaseDefinitions = {
      emptyResponse: api.defineEndpoint({
        request: null,
        response: z.object({}), // Empty object
        metadata: { path: '/empty' },
      }),

      nullableFields: api.defineEndpoint({
        request: z.object({
          optional: z.string().optional(),
          nullable: z.string().nullable(),
          nullableOptional: z.string().nullable().optional(),
        }),
        response: z.object({
          result: z.string().nullable(),
          metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
        metadata: { path: '/nullable' },
      }),

      recursiveSchema: api.defineEndpoint({
        request: z.object({
          node: nodeSchema,
        }),
        response: z.object({
          processed: z.boolean(),
          nodeCount: z.number(),
        }),
        metadata: { path: '/recursive' },
      }),

      // Endpoint that expects very specific validation
      strictValidation: api.defineEndpoint({
        request: z.object({
          uuid: z.string().uuid(),
          email: z.string().email(),
          url: z.string().url(),
          date: z.string().datetime(),
          number: z.number().int().positive(),
          enum: z.enum(['option1', 'option2', 'option3']),
          regex: z.string().regex(/^[A-Z]{2}-\d{4}$/),
        }),
        response: z.object({
          validated: z.boolean(),
          errors: z.array(z.string()).optional(),
        }),
        metadata: { path: '/strict' },
      }),
    };

    it('should handle empty response objects', async () => {
      const client = new APIClient(edgeCaseDefinitions, {
        resolver: async ({ endpoint }) => {
          if (endpoint === 'emptyResponse') {
            return {};
          }
          return {};
        },
      });

      const result = await client.request('emptyResponse');

      expectTypeOf(result).toEqualTypeOf<Record<string, never>>();
      expect(result).toEqual({});
    });

    it('should handle nullable and optional fields correctly', async () => {
      const client = new APIClient(edgeCaseDefinitions, {
        resolver: async ({ endpoint, request }) => {
          if (endpoint === 'nullableFields') {
            expectTypeOf(request).toEqualTypeOf<{
              optional?: string;
              nullable: string | null;
              nullableOptional?: string | null;
            }>();

            return {
              result: request.nullable,
              metadata: request.optional ? { hasOptional: true } : null,
            };
          }
          return {};
        },
      });

      // Test with null values
      const result1 = await client.request('nullableFields', {
        request: {
          nullable: null,
          nullableOptional: null,
        },
      });

      expectTypeOf(result1).toEqualTypeOf<{
        result: string | null;
        metadata?: Record<string, unknown> | null;
      }>();

      expect(result1.result).toBeNull();
      expect(result1.metadata).toBeNull();

      // Test with optional values provided
      const result2 = await client.request('nullableFields', {
        request: {
          optional: 'provided',
          nullable: 'not null',
          nullableOptional: 'also provided',
        },
      });

      expect(result2.result).toBe('not null');
      expect(result2.metadata).toEqual({ hasOptional: true });

      // Test with minimal required fields
      const result3 = await client.request('nullableFields', {
        request: {
          nullable: 'value',
        },
      });

      expect(result3.result).toBe('value');
      expect(result3.metadata).toBeNull();
    });

    it('should handle recursive/lazy schemas', async () => {
      const client = new APIClient(edgeCaseDefinitions, {
        resolver: async ({ endpoint, request }) => {
          if (endpoint === 'recursiveSchema') {
            const countNodes = (node: any): number => {
              let count = 1;
              if (node.children) {
                count += node.children.reduce(
                  (sum: number, child: any) => sum + countNodes(child),
                  0,
                );
              }
              return count;
            };

            return {
              processed: true,
              nodeCount: countNodes(request.node),
            };
          }
          return {};
        },
      });

      const recursiveData = {
        node: {
          id: 'root',
          value: 1,
          children: [
            {
              id: 'child1',
              value: 2,
              children: [
                { id: 'grandchild1', value: 3 },
                { id: 'grandchild2', value: 4 },
              ],
            },
            {
              id: 'child2',
              value: 5,
            },
          ],
        },
      };

      const result = await client.request('recursiveSchema', {
        request: recursiveData,
      });

      expect(result.processed).toBe(true);
      expect(result.nodeCount).toBe(5); // root + 2 children + 2 grandchildren
    });

    it('should enforce strict validation rules', async () => {
      const client = new APIClient(edgeCaseDefinitions, {
        resolver: async () => ({ validated: true }),
      });

      // Valid data should work
      const validResult = await client.request('strictValidation', {
        request: {
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com',
          url: 'https://example.com',
          date: '2023-06-01T12:00:00Z',
          number: 42,
          enum: 'option2' as const,
          regex: 'AB-1234',
        },
      });

      expect(validResult.validated).toBe(true);

      // Invalid UUID should fail
      await expect(
        client.request('strictValidation', {
          request: {
            uuid: 'not-a-uuid',
            email: 'test@example.com',
            url: 'https://example.com',
            date: '2023-06-01T12:00:00Z',
            number: 42,
            enum: 'option1' as const,
            regex: 'AB-1234',
          } as any,
        }),
      ).rejects.toThrow();

      // Invalid email should fail
      await expect(
        client.request('strictValidation', {
          request: {
            uuid: '123e4567-e89b-12d3-a456-426614174000',
            email: 'not-an-email',
            url: 'https://example.com',
            date: '2023-06-01T12:00:00Z',
            number: 42,
            enum: 'option1' as const,
            regex: 'AB-1234',
          } as any,
        }),
      ).rejects.toThrow();

      // Invalid regex should fail
      await expect(
        client.request('strictValidation', {
          request: {
            uuid: '123e4567-e89b-12d3-a456-426614174000',
            email: 'test@example.com',
            url: 'https://example.com',
            date: '2023-06-01T12:00:00Z',
            number: 42,
            enum: 'option1' as const,
            regex: 'invalid-format',
          } as any,
        }),
      ).rejects.toThrow();
    });

    it('should handle resolver timeouts and cancellations', async () => {
      const client = new APIClient(edgeCaseDefinitions, {
        resolver: async ({ abortSignal }) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve({ validated: true });
            }, 1000);

            if (abortSignal) {
              abortSignal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Request was cancelled'));
              });
            }
          });
        },
      });

      const controller = new AbortController();

      const requestPromise = client.request('strictValidation', {
        request: {
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com',
          url: 'https://example.com',
          date: '2023-06-01T12:00:00Z',
          number: 42,
          enum: 'option1' as const,
          regex: 'AB-1234',
        },
        abort: controller.signal,
      });

      // Cancel after 100ms
      setTimeout(() => controller.abort(), 100);

      await expect(requestPromise).rejects.toThrow('Request was cancelled');
    });

    it('should handle very large payloads', async () => {
      const api = defineAPI<{ path: string }>();

      const largeBatchDefinition = {
        largeBatch: api.defineEndpoint({
          request: z.object({
            items: z
              .array(
                z.object({
                  id: z.string(),
                  data: z.record(z.string(), z.unknown()),
                }),
              )
              .max(1000),
          }),
          response: z.object({
            processed: z.number(),
            errors: z.array(z.string()),
          }),
          metadata: { path: '/batch' },
        }),
      };

      const client = new APIClient(largeBatchDefinition, {
        resolver: async ({ request }) => {
          return {
            processed: request.items.length,
            errors: [],
          };
        },
      });

      // Generate large payload
      const largePayload = {
        items: Array.from({ length: 500 }, (_, i) => ({
          id: `item-${i}`,
          data: {
            value: i,
            description: `This is item number ${i}`,
            metadata: { created: new Date().toISOString() },
          },
        })),
      };

      const result = await client.request('largeBatch', {
        request: largePayload,
      });

      expect(result.processed).toBe(500);
      expect(result.errors).toHaveLength(0);
    });

    it('should maintain type safety with complex conditional types', async () => {
      const api = defineAPI<{ path: string }>();

      const conditionalDefinition = {
        conditionalEndpoint: api.defineEndpoint({
          request: z.discriminatedUnion('type', [
            z.object({
              type: z.literal('create'),
              data: z.object({
                name: z.string(),
                email: z.string().email(),
              }),
            }),
            z.object({
              type: z.literal('update'),
              id: z.string().uuid(),
              data: z.object({
                name: z.string().optional(),
                email: z.string().email().optional(),
              }),
            }),
            z.object({
              type: z.literal('delete'),
              id: z.string().uuid(),
            }),
          ]),
          response: z.discriminatedUnion('result', [
            z.object({
              result: z.literal('success'),
              id: z.string().uuid(),
              action: z.enum(['created', 'updated', 'deleted']),
            }),
            z.object({
              result: z.literal('error'),
              message: z.string(),
              code: z.number(),
            }),
          ]),
          metadata: { path: '/conditional' },
        }),
      };

      const client = new APIClient(conditionalDefinition, {
        resolver: async ({ request }) => {
          if (request.type === 'create') {
            expectTypeOf(request).toEqualTypeOf<{
              type: 'create';
              data: { name: string; email: string };
            }>();

            return {
              result: 'success' as const,
              id: '123e4567-e89b-12d3-a456-426614174000',
              action: 'created' as const,
            };
          }

          if (request.type === 'update') {
            expectTypeOf(request).toEqualTypeOf<{
              type: 'update';
              id: string;
              data: { name?: string; email?: string };
            }>();

            return {
              result: 'success' as const,
              id: request.id,
              action: 'updated' as const,
            };
          }

          if (request.type === 'delete') {
            expectTypeOf(request).toEqualTypeOf<{
              type: 'delete';
              id: string;
            }>();

            return {
              result: 'success' as const,
              id: request.id,
              action: 'deleted' as const,
            };
          }

          return {
            result: 'error' as const,
            message: 'Unknown type',
            code: 400,
          };
        },
      });

      const createResult = await client.request('conditionalEndpoint', {
        request: {
          type: 'create',
          data: { name: 'John', email: 'john@example.com' },
        },
      });

      if (createResult.result === 'success') {
        expect(createResult.action).toBe('created');
        expectTypeOf(createResult.action).toEqualTypeOf<
          'created' | 'updated' | 'deleted'
        >();
      }

      const updateResult = await client.request('conditionalEndpoint', {
        request: {
          type: 'update',
          id: '123e4567-e89b-12d3-a456-426614174000',
          data: { name: 'Jane' },
        },
      });

      if (updateResult.result === 'success') {
        expect(updateResult.action).toBe('updated');
      }
    });
  });
});
