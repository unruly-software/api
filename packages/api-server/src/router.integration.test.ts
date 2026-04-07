import { APIClient, defineAPI } from '@unruly-software/api-client';
import { beforeEach, describe, expect, it } from 'vitest';
import z from 'zod';
import { defineRouter, mergeImplementedRouters } from './router';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  auth?: boolean;
}>();

const sharedAPIDefinitions = {
  getUser: api.defineEndpoint({
    request: z.object({
      userId: z.number().int().positive(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
      createdAt: z.string().datetime(),
      profile: z
        .object({
          bio: z.string().nullable(),
          avatar: z.string().url().nullable(),
        })
        .nullable(),
    }),
    metadata: {
      path: '/users/:userId',
      method: 'GET',
      auth: true,
    },
  }),

  createUser: api.defineEndpoint({
    request: z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      bio: z.string().optional(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      createdAt: z.string().datetime(),
      profile: z
        .object({
          bio: z.string().nullable(),
          avatar: z.string().url().nullable(),
        })
        .nullable(),
    }),
    metadata: {
      path: '/users',
      method: 'POST',
    },
  }),

  updateUser: api.defineEndpoint({
    request: z.object({
      userId: z.number().int().positive(),
      name: z.string().min(1).max(100).optional(),
      bio: z.string().optional(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      createdAt: z.string().datetime(),
      profile: z
        .object({
          bio: z.string().nullable(),
          avatar: z.string().url().nullable(),
        })
        .nullable(),
    }),
    metadata: {
      path: '/users/:userId',
      method: 'PUT',
      auth: true,
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
      auth: true,
    },
  }),

  listUsers: api.defineEndpoint({
    request: z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(10),
      search: z.string().optional(),
    }),
    response: z.object({
      users: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          email: z.string(),
          createdAt: z.string().datetime(),
        }),
      ),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }),
    }),
    metadata: {
      path: '/users',
      method: 'GET',
    },
  }),

  getUserStats: api.defineEndpoint({
    request: null,
    response: z.object({
      totalUsers: z.number(),
      activeUsers: z.number(),
      newUsersToday: z.number(),
      averageAge: z.number().nullable(),
    }),
    metadata: {
      path: '/users/stats',
      method: 'GET',
      auth: true,
    },
  }),
};

type ServerContext = {
  userService: UserService;
  authService: AuthService;
  logger: Logger;
  requestId: string;
};

interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  profile: {
    bio: string | null;
    avatar: string | null;
  } | null;
}

interface UserService {
  findById(id: number): Promise<User | null>;
  create(data: { name: string; email: string; bio?: string }): Promise<User>;
  update(id: number, data: { name?: string; bio?: string }): Promise<User>;
  delete(id: number, force: boolean): Promise<void>;
  list(options: { page: number; limit: number; search?: string }): Promise<{
    users: { id: number; name: string; email: string; createdAt: string }[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>;
  getStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    newUsersToday: number;
    averageAge: number | null;
  }>;
}

interface AuthService {
  authenticate(token: string): Promise<User>;
  getPermissions(userId: number): Promise<string[]>;
}

interface Logger {
  info(message: string, extra?: any): void;
  error(message: string, extra?: any): void;
}

describe('API Client-Server Integration', () => {
  let userService: UserService;
  let authService: AuthService;
  let logger: Logger;
  let serverContext: ServerContext;

  beforeEach(() => {
    const mockUsers: User[] = [
      {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: '2023-01-01T00:00:00Z',
        profile: {
          bio: 'Software engineer',
          avatar: 'https://example.com/avatar1.jpg',
        },
      },
      {
        id: 2,
        name: 'Jane Smith',
        email: 'jane@example.com',
        createdAt: '2023-01-02T00:00:00Z',
        profile: { bio: 'Product manager', avatar: null },
      },
      {
        id: 3,
        name: 'Bob Wilson',
        email: 'bob@example.com',
        createdAt: '2023-01-03T00:00:00Z',
        profile: null,
      },
    ];

    userService = {
      findById: async (id) => mockUsers.find((u) => u.id === id) || null,
      create: async (data) => {
        const newUser: User = {
          id: mockUsers.length + 1,
          name: data.name,
          email: data.email,
          createdAt: new Date().toISOString(),
          profile: data.bio ? { bio: data.bio, avatar: null } : null,
        };
        mockUsers.push(newUser);
        return newUser;
      },
      update: async (id, data) => {
        const user = mockUsers.find((u) => u.id === id);
        if (!user) throw new Error('User not found');

        if (data.name) user.name = data.name;
        if (data.bio !== undefined) {
          if (!user.profile) user.profile = { bio: null, avatar: null };
          user.profile.bio = data.bio;
        }
        return user;
      },
      delete: async (id, force) => {
        const index = mockUsers.findIndex((u) => u.id === id);
        if (index === -1 && !force) throw new Error('User not found');
        if (index !== -1) mockUsers.splice(index, 1);
      },
      list: async (options) => {
        let filteredUsers = [...mockUsers];
        if (options.search) {
          filteredUsers = filteredUsers.filter(
            (u) =>
              u.name
                .toLowerCase()
                .includes(options.search?.toLowerCase() ?? '') ||
              u.email
                .toLowerCase()
                .includes(options.search?.toLowerCase() ?? ''),
          );
        }

        const total = filteredUsers.length;
        const totalPages = Math.ceil(total / options.limit);
        const startIndex = (options.page - 1) * options.limit;
        const users = filteredUsers.slice(
          startIndex,
          startIndex + options.limit,
        );

        return {
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            createdAt: u.createdAt,
          })),
          pagination: {
            page: options.page,
            limit: options.limit,
            total,
            totalPages,
          },
        };
      },
      getStats: async () => ({
        totalUsers: mockUsers.length,
        activeUsers: mockUsers.length,
        newUsersToday: 0,
        averageAge: null,
      }),
    };

    authService = {
      authenticate: async (token) => {
        if (token === 'valid-token') return mockUsers[0];
        throw new Error('Invalid token');
      },
      getPermissions: async (userId) => {
        if (userId === 1) return ['read:users', 'write:users', 'delete:users'];
        return ['read:users'];
      },
    };

    logger = {
      info: () => {},
      error: () => {},
    };

    serverContext = {
      userService,
      authService,
      logger,
      requestId: 'req-123',
    };
  });

  describe('Full Round-trip Integration', () => {
    it('should handle complete client-server communication flow', async () => {
      const router = defineRouter<typeof sharedAPIDefinitions, ServerContext>({
        definitions: sharedAPIDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router
            .endpoint('getUser')
            .handle(async ({ context, data }) => {
              const user = await context.userService.findById(data.userId);
              if (!user) throw new Error('User not found');
              return user;
            }),

          createUser: router
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              return await context.userService.create(data);
            }),

          updateUser: router
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),

          deleteUser: router
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),

          listUsers: router
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),

          getUserStats: router
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      const client = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          // Simulate client-server communication by calling the router directly
          return JSON.parse(
            JSON.stringify(
              await implementedRouter.dispatch({
                endpoint,
                data: request,
                context: serverContext,
              }),
            ),
          );
        },
      });

      const user = await client.request('getUser', {
        request: { userId: 1 },
      });

      expect(user).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: '2023-01-01T00:00:00Z',
        profile: {
          bio: 'Software engineer',
          avatar: 'https://example.com/avatar1.jpg',
        },
      });

      const newUser = await client.request('createUser', {
        request: {
          name: 'Alice Johnson',
          email: 'alice@example.com',
          bio: 'Designer',
        },
      });

      expect(newUser).toMatchObject({
        id: expect.any(Number),
        name: 'Alice Johnson',
        email: 'alice@example.com',
        createdAt: expect.any(String),
        profile: { bio: 'Designer', avatar: null },
      });

      const userList = await client.request('listUsers', {
        request: { page: 1, limit: 5 },
      });

      expect(userList).toMatchObject({
        users: expect.arrayContaining([
          expect.objectContaining({ name: 'John Doe' }),
          expect.objectContaining({ name: 'Jane Smith' }),
          expect.objectContaining({ name: 'Alice Johnson' }),
        ]),
        pagination: {
          page: 1,
          limit: 5,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        },
      });
    });

    it('should maintain type safety end-to-end', async () => {
      const router = defineRouter<typeof sharedAPIDefinitions, ServerContext>({
        definitions: sharedAPIDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router
            .endpoint('getUser')
            .handle(async ({ context, data }) => {
              const user = await context.userService.findById(data.userId);
              if (!user) throw new Error('User not found');
              return user;
            }),

          createUser: router
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              return await context.userService.create(data);
            }),

          updateUser: router
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),

          deleteUser: router
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),

          listUsers: router
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),

          getUserStats: router
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      const client = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          return await implementedRouter.dispatch({
            endpoint,
            data: request,
            context: serverContext,
          });
        },
      });

      const user = await client.request('getUser', {
        request: { userId: 1 },
      });

      expect(user.id).toBe(1);
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');

      const stats = await client.request('getUserStats');

      expect(stats.totalUsers).toBeTypeOf('number');
      expect(stats.activeUsers).toBeTypeOf('number');
    });
  });

  describe('Error Propagation', () => {
    it('should properly propagate server errors to client', async () => {
      const router = defineRouter<typeof sharedAPIDefinitions, ServerContext>({
        definitions: sharedAPIDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router
            .endpoint('getUser')
            .handle(async ({ context, data }) => {
              if (data.userId === 999) {
                throw new Error('Database connection failed');
              }
              const user = await context.userService.findById(data.userId);
              if (!user) throw new Error('User not found');
              return user;
            }),

          createUser: router
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              if (data.email === 'duplicate@example.com') {
                throw new Error('Email already exists');
              }
              return await context.userService.create(data);
            }),

          updateUser: router
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),

          deleteUser: router
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),

          listUsers: router
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),

          getUserStats: router
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      const client = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          return await implementedRouter.dispatch({
            endpoint,
            data: request,
            context: serverContext,
          });
        },
      });

      // Test database error propagation
      try {
        await client.request('getUser', { request: { userId: 999 } });
        expect.fail('Should have thrown database error');
      } catch (error) {
        expect((error as Error).message).toBe('Database connection failed');
      }

      // Test validation error propagation
      try {
        await client.request('createUser', {
          request: { name: 'Test', email: 'duplicate@example.com' },
        });
        expect.fail('Should have thrown duplicate email error');
      } catch (error) {
        expect((error as Error).message).toBe('Email already exists');
      }

      // Test client-side validation error (invalid request)
      try {
        await client.request('getUser', {
          request: { userId: -1 }, // Invalid: should be positive
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
      }
    });

    it('should handle client success/failure events', async () => {
      const router = defineRouter<typeof sharedAPIDefinitions, ServerContext>({
        definitions: sharedAPIDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router
            .endpoint('getUser')
            .handle(async ({ context, data }) => {
              if (data.userId === 404) throw new Error('User not found');
              const user = await context.userService.findById(data.userId);
              if (!user) throw new Error('User not found');
              return user;
            }),

          createUser: router
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              return await context.userService.create(data);
            }),

          updateUser: router
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),

          deleteUser: router
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),

          listUsers: router
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),

          getUserStats: router
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      const client = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          return await implementedRouter.dispatch({
            endpoint,
            data: request,
            context: serverContext,
          });
        },
      });

      const successMessages: any[] = [];
      const failedMessages: any[] = [];

      client.$succeeded.subscribe((message) => {
        successMessages.push(message);
      });

      client.$failed.subscribe((message) => {
        failedMessages.push(message);
      });

      // Successful request
      await client.request('getUser', { request: { userId: 1 } });

      expect(successMessages).toHaveLength(1);
      expect(successMessages[0]).toMatchObject({
        endpoint: 'getUser',
        request: { userId: 1 },
        response: expect.objectContaining({ id: 1, name: 'John Doe' }),
      });

      // Failed request
      try {
        await client.request('getUser', { request: { userId: 404 } });
      } catch {}

      expect(failedMessages).toHaveLength(1);
      expect(failedMessages[0]).toMatchObject({
        endpoint: 'getUser',
        request: { userId: 404 },
        error: expect.objectContaining({ message: 'User not found' }),
      });
    });
  });

  describe('Complex Scenarios and Router Merging', () => {
    it('should handle multi-router integration', async () => {
      // Create user management router
      const userAPI = {
        getUser: sharedAPIDefinitions.getUser,
        createUser: sharedAPIDefinitions.createUser,
        updateUser: sharedAPIDefinitions.updateUser,
        deleteUser: sharedAPIDefinitions.deleteUser,
      };

      const userRouter = defineRouter<typeof userAPI, ServerContext>({
        definitions: userAPI,
      });
      const userImpl = userRouter.implement({
        endpoints: {
          getUser: userRouter
            .endpoint('getUser')
            .handle(async ({ context, data }) => {
              const user = await context.userService.findById(data.userId);
              if (!user) throw new Error('User not found');
              return user;
            }),
          createUser: userRouter
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              return await context.userService.create(data);
            }),
          updateUser: userRouter
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),
          deleteUser: userRouter
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),
        },
      });

      // Create analytics router
      const analyticsAPI = {
        listUsers: sharedAPIDefinitions.listUsers,
        getUserStats: sharedAPIDefinitions.getUserStats,
      };

      const analyticsRouter = defineRouter<typeof analyticsAPI, ServerContext>({
        definitions: analyticsAPI,
      });
      const analyticsImpl = analyticsRouter.implement({
        endpoints: {
          listUsers: analyticsRouter
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),
          getUserStats: analyticsRouter
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      // Merge routers
      const mergedRouter = mergeImplementedRouters(analyticsImpl, userImpl);

      // Create client that works with merged router
      const client = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          return await mergedRouter.dispatch({
            endpoint,
            data: request,
            context: serverContext,
          });
        },
      });

      // Test endpoints from both routers
      const user = await client.request('getUser', { request: { userId: 1 } });
      expect(user.id).toBe(1);

      const userList = await client.request('listUsers', {
        request: { page: 1, limit: 10 },
      });
      expect(userList.users).toBeInstanceOf(Array);

      const stats = await client.request('getUserStats');
      expect(stats.totalUsers).toBeGreaterThan(0);

      const newUser = await client.request('createUser', {
        request: { name: 'Merged User', email: 'merged@example.com' },
      });
      expect(newUser.name).toBe('Merged User');
    });

    it('should handle validation consistency between client and server', async () => {
      const router = defineRouter<typeof sharedAPIDefinitions, ServerContext>({
        definitions: sharedAPIDefinitions,
      });

      const implementedRouter = router.implement({
        endpoints: {
          getUser: router
            .endpoint('getUser')
            .handle(async ({ context, data }) => {
              const user = await context.userService.findById(data.userId);
              if (!user) throw new Error('User not found');
              return user;
            }),

          createUser: router
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              return await context.userService.create(data);
            }),

          updateUser: router
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),

          deleteUser: router
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),

          listUsers: router
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),

          getUserStats: router
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      const client = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          return await implementedRouter.dispatch({
            endpoint,
            data: request,
            context: serverContext,
          });
        },
      });

      // Test that both client and server validate the same way
      // Invalid request should be caught by client first
      try {
        await client.request('createUser', {
          request: {
            name: '', // Too short (min 1)
            email: 'invalid-email', // Invalid email format
          },
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        // Should be caught by client-side validation
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;

        const nameError = zodError.issues.find((issue) =>
          issue.path.includes('name'),
        );
        const emailError = zodError.issues.find((issue) =>
          issue.path.includes('email'),
        );

        expect(nameError).toBeDefined();
        expect(emailError).toBeDefined();
      }

      // Valid request should pass client validation and reach server
      const validUser = await client.request('createUser', {
        request: {
          name: 'Valid User',
          email: 'valid@example.com',
          bio: 'Valid bio',
        },
      });

      expect(validUser.name).toBe('Valid User');
      expect(validUser.email).toBe('valid@example.com');

      // Test server response validation
      // If server returns invalid data, it should be caught by client response validation
      const invalidResponseRouter = defineRouter<
        typeof sharedAPIDefinitions,
        ServerContext
      >({
        definitions: sharedAPIDefinitions,
      });

      const invalidImplementedRouter = invalidResponseRouter.implement({
        endpoints: {
          getUser: invalidResponseRouter
            .endpoint('getUser')
            .handle(async () => {
              // Return invalid response data that doesn't match schema
              return {
                id: 'not-a-number' as any,
                name: 'Test',
                email: 'invalid-email',
                createdAt: 'invalid-date',
                profile: 'not-an-object' as any,
              };
            }),

          createUser: invalidResponseRouter
            .endpoint('createUser')
            .handle(async ({ context, data }) => {
              return await context.userService.create(data);
            }),

          updateUser: invalidResponseRouter
            .endpoint('updateUser')
            .handle(async ({ context, data }) => {
              return await context.userService.update(data.userId, {
                name: data.name,
                bio: data.bio,
              });
            }),

          deleteUser: invalidResponseRouter
            .endpoint('deleteUser')
            .handle(async ({ context, data }) => {
              await context.userService.delete(data.userId, data.force);
              return undefined;
            }),

          listUsers: invalidResponseRouter
            .endpoint('listUsers')
            .handle(async ({ context, data }) => {
              return await context.userService.list(data);
            }),

          getUserStats: invalidResponseRouter
            .endpoint('getUserStats')
            .handle(async ({ context }) => {
              return await context.userService.getStats();
            }),
        },
      });

      const invalidClient = new APIClient(sharedAPIDefinitions, {
        resolver: async ({ endpoint, request }) => {
          return await invalidImplementedRouter.dispatch({
            endpoint,
            data: request,
            context: serverContext,
          });
        },
      });

      try {
        await invalidClient.request('getUser', { request: { userId: 1 } });
        expect.fail('Should have thrown response validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
      }
    });
  });
});
