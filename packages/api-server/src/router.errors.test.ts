import { defineAPI } from '@unruly-software/api-client';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { defineRouter, mergeImplementedRouters } from './router';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const testDefinitions = {
  getUser: api.defineEndpoint({
    request: z.object({
      userId: z.number().int().positive(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
      createdAt: z.string().datetime(),
    }),
    metadata: {
      path: '/users/:userId',
      method: 'GET',
    },
  }),

  createUser: api.defineEndpoint({
    request: z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      age: z.number().int().min(0).max(120),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      createdAt: z.string().datetime(),
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
      services: z.record(z.string(), z.enum(['healthy', 'degraded', 'down'])),
    }),
    metadata: {
      path: '/health',
      method: 'GET',
    },
  }),

  deleteUser: api.defineEndpoint({
    request: z.object({
      userId: z.number().int().positive(),
      force: z.boolean().default(false),
    }),
    response: null,
    metadata: {
      path: '/users/:userId',
      method: 'DELETE',
    },
  }),

  complexValidation: api.defineEndpoint({
    request: z.object({
      profile: z.object({
        personalInfo: z.object({
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          dateOfBirth: z.string().datetime(),
        }),
        preferences: z.array(z.enum(['email', 'sms', 'push'])).min(1),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
      permissions: z.array(z.string()).min(1),
    }),
    response: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('success'),
        profileId: z.string().uuid(),
        userId: z.number(),
      }),
      z.object({
        type: z.literal('validation_error'),
        errors: z.array(
          z.object({
            field: z.string(),
            message: z.string(),
          }),
        ),
      }),
    ]),
    metadata: {
      path: '/profiles',
      method: 'POST',
    },
  }),
};

type AppContext = {
  userService: UserService;
  logger: Logger;
  db: Database;
};

interface UserService {
  findById(id: number): Promise<User | null>;
  create(data: { name: string; email: string; age: number }): Promise<User>;
  delete(id: number): Promise<void>;
}

interface Logger {
  info(message: string, extra?: any): void;
  error(message: string, extra?: any): void;
  warn(message: string, extra?: any): void;
}

interface Database {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

describe('Router Error Handling', () => {
  const mockContext: AppContext = {
    userService: {
      findById: async (id) => ({
        id,
        name: 'Test User',
        email: 'test@example.com',
        createdAt: '2023-01-01T00:00:00Z',
      }),
      create: async (data) => ({
        id: 1,
        ...data,
        createdAt: '2023-01-01T00:00:00Z',
      }),
      delete: async () => {},
    },
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
    db: {
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
    },
  };

  describe('Request Validation Errors', () => {
    it('should throw detailed validation errors for invalid request data', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: { db: 'healthy' as const },
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      // Test missing required fields
      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: {} as any,
          context: mockContext,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues).toHaveLength(1);
        expect(zodError.issues[0].path).toEqual(['userId']);
        expect(zodError.issues[0].code).toBe('invalid_type');
      }

      // Test invalid field types
      try {
        await implementedRouter.dispatch({
          endpoint: 'createUser',
          data: {
            name: 123 as any, // Should be string
            email: 'invalid-email',
            age: 'twenty' as any, // Should be number
          },
          context: mockContext,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues.length).toBeGreaterThan(0);

        // Check for type errors
        const typeErrors = zodError.issues.filter(
          (issue) => issue.code === 'invalid_type',
        );
        expect(typeErrors.length).toBeGreaterThan(0);
      }

      // Test constraint violations
      try {
        await implementedRouter.dispatch({
          endpoint: 'createUser',
          data: {
            name: '', // Too short (min 1)
            email: 'valid@email.com',
            age: 150, // Too old (max 120)
          },
          context: mockContext,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(
          zodError.issues.some(
            (issue) =>
              issue.path.includes('name') && issue.code === 'too_small',
          ),
        ).toBe(true);
        expect(
          zodError.issues.some(
            (issue) => issue.path.includes('age') && issue.code === 'too_big',
          ),
        ).toBe(true);
      }

      // Test negative numbers for positive-only fields
      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: { userId: -1 },
          context: mockContext,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues[0].code).toBe('too_small');
        expect(zodError.issues[0].path).toEqual(['userId']);
      }
    });

    it('should handle complex nested validation errors', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'complexValidation',
          data: {
            profile: {
              personalInfo: {
                firstName: '', // Invalid: too short
                lastName: 'Doe',
                dateOfBirth: 'not-a-date', // Invalid format
              },
              preferences: [], // Invalid: min 1 item
              metadata: {
                key1: 'value1',
              },
            },
            permissions: [], // Invalid: min 1 item
          },
          context: mockContext,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;

        // Should have errors for multiple nested fields
        const firstNameError = zodError.issues.find((issue) =>
          issue.path.includes('firstName'),
        );
        const dateOfBirthError = zodError.issues.find((issue) =>
          issue.path.includes('dateOfBirth'),
        );
        const preferencesError = zodError.issues.find((issue) =>
          issue.path.includes('preferences'),
        );
        const permissionsError = zodError.issues.find((issue) =>
          issue.path.includes('permissions'),
        );

        expect(firstNameError).toBeDefined();
        expect(dateOfBirthError).toBeDefined();
        expect(preferencesError).toBeDefined();
        expect(permissionsError).toBeDefined();
      }
    });

    it('should not validate request for endpoints with null request schema', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: { db: 'healthy' as const, cache: 'healthy' as const },
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      // Should work fine without request data for null request schema
      const result = await implementedRouter.dispatch({
        endpoint: 'healthCheck',
        data: {} as never,
        context: mockContext,
      });

      expect(result).toMatchObject({
        status: 'ok',
        timestamp: expect.any(Number),
        services: expect.any(Object),
      });
    });
  });

  describe('Handler Errors', () => {
    it('should propagate errors thrown by endpoint handlers', async () => {
      const handlerError = new Error('Database connection failed');

      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => {
            throw handlerError;
          }),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: { userId: 123 },
          context: mockContext,
        });
        expect.fail('Should have thrown handler error');
      } catch (error) {
        expect(error).toBe(handlerError);
        expect((error as Error).message).toBe('Database connection failed');
      }
    });

    it('should handle async errors in handlers', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async ({ data }) => {
            // Simulate async database operation that fails
            await new Promise((resolve) => setTimeout(resolve, 1));

            if (data.userId === 999) {
              throw new Error('User not found in database');
            }

            return {
              id: data.userId,
              name: 'Test User',
              email: 'test@example.com',
              createdAt: '2023-01-01T00:00:00Z',
            };
          }),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: { userId: 999 },
          context: mockContext,
        });
        expect.fail('Should have thrown async handler error');
      } catch (error) {
        expect((error as Error).message).toBe('User not found in database');
      }
    });
  });

  describe('Response Validation Errors', () => {
    it('should throw validation errors for invalid response data', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => {
            return {
              // Missing required fields: id, name, email, createdAt
            } as any;
          }),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: { userId: 123 },
          context: mockContext,
        });
        expect.fail('Should have thrown response validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues).toHaveLength(4); // All required fields missing

        const missingFields = zodError.issues.map((issue) => issue.path[0]);
        expect(missingFields).toEqual(
          expect.arrayContaining(['id', 'name', 'email', 'createdAt']),
        );
      }
    });

    it('should validate response types correctly', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => {
            return {
              id: 'not-a-number' as any,
              name: 123 as any,
              email: 'test@example.com',
              createdAt: 'not-a-datetime',
            };
          }),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: { userId: 123 },
          context: mockContext,
        });
        expect.fail('Should have thrown response validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues.length).toBeGreaterThanOrEqual(3);

        const idTypeError = zodError.issues.find(
          (issue) => issue.path.includes('id') && issue.code === 'invalid_type',
        );
        const nameTypeError = zodError.issues.find(
          (issue) =>
            issue.path.includes('name') && issue.code === 'invalid_type',
        );
        const dateTimeError = zodError.issues.find((issue) =>
          issue.path.includes('createdAt'),
        );

        expect(idTypeError).toBeDefined();
        expect(nameTypeError).toBeDefined();
        expect(dateTimeError).toBeDefined();
      }
    });

    it('should handle discriminated union response validation', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => {
              return {
                type: 'unknown',
                someField: 'value',
              } as any;
            }),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'complexValidation',
          data: {
            profile: {
              personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                dateOfBirth: '2023-01-01T00:00:00Z',
              },
              preferences: ['email'],
            },
            permissions: ['read'],
          },
          context: mockContext,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;

        const discriminatorError = zodError.issues.find(
          (issue) =>
            issue.code === 'invalid_union' ||
            issue.message.includes('Invalid discriminator value') ||
            issue.message.includes('Invalid input'),
        );
        expect(discriminatorError || zodError.issues.length > 0).toBeTruthy();
      }
    });

    it('should not validate response for endpoints with null response schema', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router.endpoint('deleteUser').handle(async () => {
            return undefined;
          }),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      const result = await implementedRouter.dispatch({
        endpoint: 'deleteUser',
        data: { userId: 123, force: true },
        context: mockContext,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Router Configuration Errors', () => {
    it('should throw error for unknown endpoints', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          // @ts-expect-error Testing runtime behavior
          endpoint: 'nonExistentEndpoint',
          data: {} as any,
          context: mockContext,
        });
        expect.fail('Should have thrown error for unknown endpoint');
      } catch (error) {
        expect((error as Error).message).toMatch(
          /No definition for endpoint nonExistentEndpoint/,
        );
      }
    });

    it('should throw error for missing endpoint implementations', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        // @ts-expect-error
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'healthCheck',
          data: {} as never,
          context: mockContext,
        });
        expect.fail('Should have thrown error for missing implementation');
      } catch (error) {
        expect((error as Error).message).toMatch(
          /No implementation for endpoint healthCheck/,
        );
      }
    });

    it('should handle router merging errors', async () => {
      // Create first router with conflicting endpoint names
      const api1 = {
        getUser: testDefinitions.getUser,
      };

      const router1 = defineRouter<typeof api1, { service1: any }>({
        definitions: api1,
      }).implement({
        endpoints: {
          getUser: defineRouter({ definitions: api1 })
            .endpoint('getUser')
            .handle(async () => ({
              id: 1,
              name: 'Router1',
              email: 'test@example.com',
              createdAt: '2023-01-01T00:00:00Z',
            })),
        },
      });

      // Create second router with same endpoint name
      const api2 = {
        getUser: api.defineEndpoint({
          request: z.object({ userId: z.string() }), // Different request type
          response: z.object({ id: z.string(), name: z.string() }), // Different response type
          metadata: { path: '/users/:userId', method: 'GET' },
        }),
      };

      const router2 = defineRouter<typeof api2, { service2: any }>({
        definitions: api2,
      }).implement({
        endpoints: {
          getUser: defineRouter({ definitions: api2 })
            .endpoint('getUser')
            .handle(async () => ({ id: '1', name: 'Router2' })) as any,
        },
      });

      /**
       * TODO: Fix this. The merged router should throw an error due to
       * conflicting endpoint definitions (same name but different
       * request/response types). The current implementation of
       * mergeImplementedRouters does not handle this case and simply merges the
       * endpoints, which can lead to runtime errors when dispatching requests.
       * We need to add validation logic in mergeImplementedRouters to detect
       * such conflicts and throw a descriptive error instead of allowing the
       * merge to succeed.
       */
      const mergedRouter = mergeImplementedRouters(router1, router2);

      expect(mergedRouter.definitions.getUser).toBe(api2.getUser);
      expect(mergedRouter.endpoints.getUser).toBe(router2.endpoints.getUser);
    });
  });

  describe('Edge Cases and Complex Error Scenarios', () => {
    it('should handle null and undefined values appropriately', async () => {
      const router = defineRouter<typeof testDefinitions, AppContext>({
        definitions: testDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router.endpoint('getUser').handle(async () => {
            return null as any; // Invalid: should return object
          }),
          createUser: router.endpoint('createUser').handle(async () => ({
            id: 1,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          })),
          healthCheck: router.endpoint('healthCheck').handle(async () => ({
            status: 'ok' as const,
            timestamp: Date.now(),
            services: {},
          })),
          deleteUser: router
            .endpoint('deleteUser')
            .handle(async () => undefined),
          complexValidation: router
            .endpoint('complexValidation')
            .handle(async () => ({
              type: 'success' as const,
              profileId: '123e4567-e89b-12d3-a456-426614174000',
              userId: 1,
            })),
        },
      });

      try {
        await implementedRouter.dispatch({
          endpoint: 'getUser',
          data: { userId: 123 },
          context: mockContext,
        });
        expect.fail('Should have thrown validation error for null response');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
      }
    });
  });
});
