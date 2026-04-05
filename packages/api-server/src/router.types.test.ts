import { defineAPI } from '@unruly-software/api-client';
import { beforeEach, describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { defineRouter, mergeImplementedRouters } from './router';

// Define test API
const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const testDefinitions = {
  getUser: api.defineEndpoint({
    request: z.object({
      userId: z.number(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    }),
    metadata: {
      path: '/users/:userId',
      method: 'GET',
    },
  }),

  createUser: api.defineEndpoint({
    request: z.object({
      name: z.string(),
      email: z.string(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    }),
    metadata: {
      path: '/users',
      method: 'POST',
    },
  }),

  healthCheck: api.defineEndpoint({
    request: null,
    response: z.object({
      status: z.literal('ok'),
      timestamp: z.number(),
    }),
    metadata: {
      path: '/health',
      method: 'GET',
    },
  }),

  deleteUser: api.defineEndpoint({
    request: z.object({
      userId: z.number(),
    }),
    response: null,
    metadata: {
      path: '/users/:userId',
      method: 'DELETE',
    },
  }),
};

type BaseContext = {
  db: Database;
  logger: Logger;
};

interface Database {
  users: {
    find(id: number): Promise<User | null>;
    create(data: { name: string; email: string }): Promise<User>;
    delete(id: number): Promise<void>;
  };
}

interface Logger {
  info(message: string): void;
  error(message: string, extra?: any): void;
}

interface User {
  id: number;
  name: string;
  email: string;
}

describe('Router Type Tests', () => {
  beforeEach((t) => {
    // This is strictly for testing types
    t.skip();
  });

  describe('Router Definition Types', () => {
    it('should infer correct router type from API definitions', () => {
      const router = defineRouter<typeof testDefinitions, BaseContext>({
        definitions: testDefinitions,
      });

      expectTypeOf(router).toMatchTypeOf<{
        endpoint: <K extends keyof typeof testDefinitions>(endpoint: K) => any;
        implement: (args: { endpoints: any }) => any;
      }>();
    });

    it('should correctly type endpoint method', () => {
      const router = defineRouter<typeof testDefinitions, BaseContext>({
        definitions: testDefinitions,
      });

      const getUserRoute = router.endpoint('getUser');

      expectTypeOf(getUserRoute).toEqualTypeOf<{
        handle: (
          handler: (input: {
            context: BaseContext;
            data: {
              userId: number;
            };
            definition: typeof testDefinitions.getUser;
          }) => Promise<{
            id: number;
            name: string;
            email: string;
          }>,
        ) => {
          handle: (input: {
            data: {
              userId: number;
            };
            context: BaseContext;
          }) => Promise<{
            id: number;
            name: string;
            email: string;
          }>;

          handleDirect: (input: {
            data: {
              userId: number;
            };
            context: BaseContext;
          }) => Promise<{
            id: number;
            name: string;
            email: string;
          }>;
        };
      }>();
    });
  });

  describe('Handler Function Types', () => {
    it('should correctly type handler input parameters', () => {
      const router = defineRouter<typeof testDefinitions, BaseContext>({
        definitions: testDefinitions,
      });

      router
        .endpoint('getUser')
        .handle(async ({ context, data, definition }) => {
          expectTypeOf(context).toEqualTypeOf<BaseContext>();
          expectTypeOf(data).toEqualTypeOf<{ userId: number }>();
          expectTypeOf(definition).toEqualTypeOf<
            typeof testDefinitions.getUser
          >();

          return { id: 1, name: 'Test', email: 'test@example.com' };
        });

      router
        .endpoint('createUser')
        .handle(async ({ context, data, definition }) => {
          expectTypeOf(context).toEqualTypeOf<BaseContext>();
          expectTypeOf(data).toEqualTypeOf<{ name: string; email: string }>();
          expectTypeOf(definition).toEqualTypeOf<
            typeof testDefinitions.createUser
          >();

          return { id: 1, name: data.name, email: data.email };
        });

      // (null request)
      router
        .endpoint('healthCheck')
        .handle(async ({ context, data, definition }) => {
          expectTypeOf(context).toEqualTypeOf<BaseContext>();
          expectTypeOf(data).toEqualTypeOf<never>();
          expectTypeOf(definition).toEqualTypeOf<
            typeof testDefinitions.healthCheck
          >();

          return { status: 'ok' as const, timestamp: Date.now() };
        });

      //  (null response)
      router
        .endpoint('deleteUser')
        .handle(async ({ context, data, definition }) => {
          expectTypeOf(context).toEqualTypeOf<BaseContext>();
          expectTypeOf(data).toEqualTypeOf<{ userId: number }>();
          expectTypeOf(definition).toEqualTypeOf<
            typeof testDefinitions.deleteUser
          >();
          return undefined;
        });
    });

    it('should correctly type handler return values', () => {
      const router = defineRouter<typeof testDefinitions, BaseContext>({
        definitions: testDefinitions,
      });

      router.endpoint('getUser').handle(async () => {
        return { id: 1, name: 'Test', email: 'test@example.com' };
      });

      router.endpoint('healthCheck').handle(async () => {
        return { status: 'ok', timestamp: Date.now() };
      });

      router.endpoint('deleteUser').handle(async ({ data }) => {
        if (data.userId) {
          return undefined;
        }
      });
    });
  });

  describe('Implemented Router Types', () => {
    const mockContext: BaseContext = {
      db: {} as Database,
      logger: {} as Logger,
    };

    it('should correctly type dispatch method', () => {
      const router = defineRouter<typeof testDefinitions, BaseContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
        },
      });

      // Test dispatch parameter types
      const getUserResult = implementedRouter.dispatch({
        endpoint: 'getUser',
        data: { userId: 123 },
        context: mockContext,
      });

      const createUserResult = implementedRouter.dispatch({
        endpoint: 'createUser',
        data: { name: 'Test', email: 'test@example.com' },
        context: mockContext,
      });

      const healthCheckResult = implementedRouter.dispatch({
        endpoint: 'healthCheck',
        data: {} as never,
        context: mockContext,
      });

      const deleteUserResult = implementedRouter.dispatch({
        endpoint: 'deleteUser',
        data: { userId: 123 },
        context: mockContext,
      });

      // Test return types
      expectTypeOf(getUserResult).toEqualTypeOf<
        Promise<{ id: number; name: string; email: string }>
      >();
      expectTypeOf(createUserResult).toEqualTypeOf<
        Promise<{ id: number; name: string; email: string }>
      >();
      expectTypeOf(healthCheckResult).toEqualTypeOf<
        Promise<{ status: 'ok'; timestamp: number }>
      >();
      expectTypeOf(deleteUserResult).toEqualTypeOf<Promise<void>>();

      // invalid endpoint
      implementedRouter.dispatch({
        // @ts-expect-error
        endpoint: 'invalidEndpoint',
        data: { userId: 1 },
        context: mockContext,
      });
      implementedRouter.dispatch({
        endpoint: 'getUser',
        // @ts-expect-error
        data: {},
        context: mockContext,
      }); // missing required field

      // wrong data type
      implementedRouter.dispatch({
        endpoint: 'getUser',
        // @ts-expect-error
        data: { userId: 'not-a-number' },
        context: mockContext,
      });
    });

    it('should correctly type endpoint handlers', () => {
      const router = defineRouter<typeof testDefinitions, BaseContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
        },
      });

      // Test that endpoints are correctly typed
      expectTypeOf(implementedRouter.endpoints.getUser).toMatchTypeOf<{
        handle: (input: {
          context: BaseContext;
          data: { userId: number };
        }) => Promise<{ id: number; name: string; email: string }>;
        handleDirect: (input: {
          context: BaseContext;
          data: { userId: number };
        }) => Promise<{ id: number; name: string; email: string }>;
      }>();

      expectTypeOf(implementedRouter.endpoints.createUser).toMatchTypeOf<{
        handle: (input: {
          context: BaseContext;
          data: { name: string; email: string };
        }) => Promise<{ id: number; name: string; email: string }>;
        handleDirect: (input: {
          context: BaseContext;
          data: { name: string; email: string };
        }) => Promise<{ id: number; name: string; email: string }>;
      }>();

      expectTypeOf(implementedRouter.endpoints.healthCheck).toMatchTypeOf<{
        handle: (input: {
          context: BaseContext;
          data: never;
        }) => Promise<{ status: 'ok'; timestamp: number }>;
        handleDirect: (input: {
          context: BaseContext;
          data: never;
        }) => Promise<{ status: 'ok'; timestamp: number }>;
      }>();
    });
  });

  describe('Router Merging Types', () => {
    it('should correctly type merged routers', () => {
      // Create first router
      const userAPI = {
        getUser: testDefinitions.getUser,
        createUser: testDefinitions.createUser,
      };

      const userRouter = defineRouter<typeof userAPI, { userService: any }>({
        definitions: userAPI,
      }).implement({
        endpoints: {
          getUser: defineRouter({ definitions: userAPI })
            .endpoint('getUser')
            .handle(async () => ({
              id: 1,
              name: 'Test',
              email: 'test@example.com',
              createdAt: '2023-01-01T00:00:00Z',
              profile: null,
            })),
          createUser: defineRouter({ definitions: userAPI })
            .endpoint('createUser')
            .handle(async () => ({
              id: 1,
              name: 'Test',
              email: 'test@example.com',
              createdAt: '2023-01-01T00:00:00Z',
              profile: null,
            })),
        },
      });

      // Create second router
      const healthAPI = {
        healthCheck: testDefinitions.healthCheck,
        deleteUser: testDefinitions.deleteUser,
      };

      const healthRouter = defineRouter<
        typeof healthAPI,
        { healthService: any }
      >({
        definitions: healthAPI,
      }).implement({
        endpoints: {
          healthCheck: defineRouter({ definitions: healthAPI })
            .endpoint('healthCheck')
            .handle(async () => ({
              status: 'ok' as const,
              timestamp: Date.now(),
            })),
          deleteUser: defineRouter({ definitions: healthAPI })
            .endpoint('deleteUser')
            .handle(async () => undefined),
        },
      });

      // Merge routers
      const mergedRouter = mergeImplementedRouters(userRouter, healthRouter);

      // Test merged router types
      expectTypeOf(mergedRouter.definitions).toEqualTypeOf<
        typeof userAPI & typeof healthAPI
      >();

      expectTypeOf(mergedRouter.endpoints).toMatchTypeOf<{
        getUser: any;
        createUser: any;
        healthCheck: any;
        deleteUser: any;
      }>();

      // Test dispatch with merged context
      const dispatchResult = mergedRouter.dispatch({
        endpoint: 'getUser',
        data: { userId: 123 },
        context: { userService: {}, healthService: {} },
      });

      expectTypeOf(dispatchResult).toEqualTypeOf<
        Promise<{ id: number; name: string; email: string }>
      >();

      // Test that all endpoints from both routers are available
      // These would be type-checked at compile time:
      // mergedRouter.dispatch({ endpoint: 'getUser', data: { userId: 123 }, context: { userService: {}, healthService: {} } });
      // mergedRouter.dispatch({ endpoint: 'createUser', data: { name: 'Test', email: 'test@example.com' }, context: { userService: {}, healthService: {} } });
      // mergedRouter.dispatch({ endpoint: 'healthCheck', data: {} as never, context: { userService: {}, healthService: {} } });
      // mergedRouter.dispatch({ endpoint: 'deleteUser', data: { userId: 123 }, context: { userService: {}, healthService: {} } });
    });
  });

  describe('Edge Cases and Complex Types', () => {
    it('should handle complex nested request/response types', () => {
      const complexAPI = {
        complexEndpoint: api.defineEndpoint({
          request: z.object({
            user: z.object({
              profile: z.object({
                name: z.string(),
                settings: z.record(z.string(), z.unknown()),
              }),
              permissions: z.array(z.enum(['read', 'write', 'admin'])),
            }),
            metadata: z
              .record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean()]),
              )
              .optional(),
          }),
          response: z.discriminatedUnion('status', [
            z.object({
              status: z.literal('success'),
              data: z.object({
                userId: z.string().uuid(),
                profileId: z.string(),
              }),
            }),
            z.object({
              status: z.literal('error'),
              error: z.object({
                code: z.number(),
                message: z.string(),
                details: z.record(z.string(), z.unknown()).optional(),
              }),
            }),
          ]),
          metadata: {
            path: '/complex',
            method: 'POST',
          },
        }),
      };

      const complexRouter = defineRouter<typeof complexAPI, BaseContext>({
        definitions: complexAPI,
      });

      const complexHandler = complexRouter
        .endpoint('complexEndpoint')
        .handle(async ({ data }) => {
          expectTypeOf(data).toEqualTypeOf<{
            user: {
              profile: {
                name: string;
                settings: Record<string, unknown>;
              };
              permissions: ('read' | 'write' | 'admin')[];
            };
            metadata?: Record<string, string | number | boolean>;
          }>();

          // Return discriminated union type
          return {
            status: 'success' as const,
            data: {
              userId: '123e4567-e89b-12d3-a456-426614174000',
              profileId: 'profile-123',
            },
          } as any;
        });

      expectTypeOf(complexHandler).toMatchTypeOf<{
        handle: (input: { context: BaseContext; data: any }) => Promise<
          | {
              status: 'success';
              data: { userId: string; profileId: string };
            }
          | {
              status: 'error';
              error: {
                code: number;
                message: string;
                details?: Record<string, unknown>;
              };
            }
        >;
        handleDirect: any;
      }>();
    });

    it('should handle recursive schema types', () => {
      const nodeSchema: z.ZodType<{
        id: string;
        value: number;
        children: Array<{
          id: string;
          value: number;
          children: any;
        }>;
      }> = z.lazy(() =>
        z.object({
          id: z.string(),
          value: z.number(),
          children: z.array(nodeSchema),
        }),
      );

      const treeAPI = {
        createTree: api.defineEndpoint({
          request: nodeSchema,
          response: z.object({
            treeId: z.string(),
            nodeCount: z.number(),
          }),
          metadata: {
            path: '/trees',
            method: 'POST',
          },
        }),
      };

      const treeRouter = defineRouter<typeof treeAPI, BaseContext>({
        definitions: treeAPI,
      });

      treeRouter.endpoint('createTree').handle(async ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{
          id: string;
          value: number;
          children: {
            id: string;
            value: number;
            children: any;
          }[];
        }>();

        return {
          treeId: 'tree-123',
          nodeCount: 1,
        } as any;
      });
    });

    it('should handle optional fields and nullable types', () => {
      const optionalAPI = {
        updateUser: api.defineEndpoint({
          request: z.object({
            userId: z.number(),
            name: z.string().optional(),
            email: z.string().email().optional(),
            profile: z
              .object({
                bio: z.string().optional(),
                avatar: z.string().url().nullable(),
              })
              .optional(),
          }),
          response: z.object({
            id: z.number(),
            name: z.string(),
            email: z.string(),
            profile: z
              .object({
                bio: z.string().nullable(),
                avatar: z.string().nullable(),
              })
              .nullable(),
          }),
          metadata: {
            path: '/users/:userId',
            method: 'PUT',
          },
        }),
      };

      const optionalRouter = defineRouter<typeof optionalAPI, BaseContext>({
        definitions: optionalAPI,
      });

      optionalRouter.endpoint('updateUser').handle(async ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{
          userId: number;
          name?: string;
          email?: string;
          profile?: {
            avatar: string | null;
            bio?: string;
          };
        }>();

        return {
          id: data.userId,
          name: 'Test',
          email: 'test@example.com',
          profile: null,
        };
      });
    });
  });
});
