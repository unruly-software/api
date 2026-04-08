import { renderHook, waitFor } from '@testing-library/react';
import { defineAPI } from '@unruly-software/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { defineAPIQueryKeys, mountAPIQueryClient, queryKey } from './index';
import { createTestEnv, type TestEnv, UserSchema } from './testHelpers';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const testDefinition = {
  getUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'GET' },
    request: z.object({ userId: z.number() }),
    response: UserSchema,
  }),

  getUsers: api.defineEndpoint({
    metadata: { path: '/users', method: 'GET' },
    request: null,
    response: z.array(UserSchema),
  }),

  createUser: api.defineEndpoint({
    metadata: { path: '/users', method: 'POST' },
    request: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    response: UserSchema,
  }),

  updateUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'PUT' },
    request: z.object({
      userId: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional(),
    }),
    response: UserSchema,
  }),

  deleteUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'DELETE' },
    request: z.object({ userId: z.number() }),
    response: null,
  }),
};

const config = defineAPIQueryKeys(testDefinition, {
  getUser: (request) => queryKey('user', request?.userId),
  getUsers: () => queryKey('users'),
});

describe('Cache Management Tests', () => {
  let queryClient: TestEnv<typeof testDefinition>['queryClient'];
  let mockResolver: TestEnv<typeof testDefinition>['mockResolver'];
  let apiClient: TestEnv<typeof testDefinition>['apiClient'];
  let wrapper: TestEnv<typeof testDefinition>['wrapper'];

  beforeEach(() => {
    ({ queryClient, mockResolver, apiClient, wrapper } =
      createTestEnv(testDefinition));
  });

  describe('Query Key Generation', () => {
    it('should use default query keys when not configured', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

      const userData = { id: 1, name: 'John', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () =>
          useAPIQuery('createUser', {
            data: { name: 'John', email: 'john@example.com' },
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(userData);

      // createUser has no resolver in config.queryKeys, so the cache uses
      // the default [endpointName, request] shape
      const defaultQueryKey = [
        'createUser',
        { name: 'John', email: 'john@example.com' },
      ];
      const cachedData = queryClient.getQueryData(defaultQueryKey);
      expect(cachedData).toEqual(userData);
    });

    it('should use custom query keys when configured', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

      const userData = { id: 1, name: 'John', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(userData);

      const customQueryKey = ['user', 1];
      const cachedData = queryClient.getQueryData(customQueryKey);
      expect(cachedData).toEqual(userData);

      const defaultKeyData = queryClient.getQueryData([
        'getUser',
        { userId: 1 },
      ]);
      expect(defaultKeyData).toBeUndefined();
    });

    it('should handle query keys for endpoints with no request data', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

      const usersData = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];
      mockResolver.mockResolvedValue(usersData);

      const { result } = renderHook(() => useAPIQuery('getUsers'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(usersData);

      const customQueryKey = ['users'];
      const cachedData = queryClient.getQueryData(customQueryKey);
      expect(cachedData).toHaveLength(2);
      expect(cachedData).toEqual(usersData);
    });
  });

  describe('Cache Invalidation on Success', () => {
    it('should invalidate specified queries after successful mutation', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          createUser: {
            invalidates: ({ response }) => [
              ['users'], // Invalidate users list
              ['user', response.id], // Invalidate specific user
            ],
          },
        },
      });

      queryClient.setQueryData(
        ['users'],
        [{ id: 1, name: 'John', email: 'john@example.com' }],
      );
      queryClient.setQueryData(['user', 1], {
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });

      queryClient.invalidateQueries = vi.fn();

      const newUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      result.current.mutate({ name: 'Jane', email: 'jane@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['users'],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 2],
      });
    });

    it('should invalidate multiple query patterns', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          updateUser: {
            invalidates: ({ request, response }) => [
              ['user', request.userId],
              ['users'],
              ['user-profile', response.id],
              ['user-posts', response.id],
            ],
          },
        },
      });

      queryClient.invalidateQueries = vi.fn();

      const updatedUser = {
        id: 1,
        name: 'Updated John',
        email: 'john@example.com',
      };
      mockResolver.mockResolvedValue(updatedUser);

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      result.current.mutate({ userId: 1, name: 'Updated John' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 1],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['users'],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user-profile', 1],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user-posts', 1],
      });
    });
  });

  describe('Cache Invalidation on Error', () => {
    it('should invalidate specified queries after mutation error', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          updateUser: {
            errorInvalidates: ({ request }) => [
              ['user', request.userId], // Invalidate potentially stale user data
              ['users'], // Invalidate list that might be outdated
            ],
          },
        },
      });

      queryClient.setQueryData(['user', 1], {
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
      queryClient.setQueryData(
        ['users'],
        [{ id: 1, name: 'John', email: 'john@example.com' }],
      );

      queryClient.invalidateQueries = vi.fn();

      mockResolver.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      result.current.mutate({ userId: 1, name: 'Failed Update' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 1],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['users'],
      });
    });

    it('should not invalidate queries when errorInvalidates is not configured', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          updateUser: {
            // No errorInvalidates configured
          },
        },
      });

      queryClient.invalidateQueries = vi.fn();

      mockResolver.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      result.current.mutate({ userId: 1, name: 'Failed Update' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify no invalidations occurred
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe('Complex Cache Management Scenarios', () => {
    it('should handle conditional cache operations based on response data', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          updateUser: {
            invalidates: ({ response }) => {
              const queries: (readonly (string | number)[])[] = [
                ['user', response.id],
              ];
              // Only invalidate users list if name changed
              if (response.name !== 'John') {
                queries.push(['users']);
              }
              return queries;
            },
          },
        },
      });
      queryClient.invalidateQueries = vi.fn();

      const firstUpdate = { id: 1, name: 'Johnny', email: 'john@example.com' };
      mockResolver.mockResolvedValue(firstUpdate);

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      result.current.mutate({ userId: 1, name: 'Johnny' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 1],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['users'],
      });

      vi.clearAllMocks();
      result.current.reset(); // Reset mutation state

      const secondUpdate = {
        id: 1,
        name: 'John',
        email: 'john.new@example.com',
      };
      mockResolver.mockResolvedValue(secondUpdate);

      result.current.mutate({ userId: 1, email: 'john.new@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 1],
      });
      expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ['users'],
      });
    });

    it('should handle cache operations when no configuration is provided', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

      queryClient.setQueryData = vi.fn();
      queryClient.invalidateQueries = vi.fn();

      const newUser = { id: 4, name: 'Alice', email: 'alice@example.com' };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      result.current.mutate({ name: 'Alice', email: 'alice@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify no cache operations occurred (since no config provided)
      expect(queryClient.setQueryData).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });
  });
});
