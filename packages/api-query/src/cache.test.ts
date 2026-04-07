import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { APIClient, defineAPI } from '@unruly-software/api-client';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { mountAPIQueryClient } from './index';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const testDefinition = {
  getUser: api.defineEndpoint({
    metadata: { path: '/users/:id', method: 'GET' },
    request: z.object({ userId: z.number() }),
    response: UserSchema,
    apiQuery: {
      queryKey: (request) => ['user', request?.userId],
    },
  }),

  getUsers: api.defineEndpoint({
    metadata: { path: '/users', method: 'GET' },
    request: null,
    response: z.array(UserSchema),
    apiQuery: {
      queryKey: () => ['users'],
    },
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

describe('Cache Management Tests', () => {
  let queryClient: QueryClient;
  let mockResolver: ReturnType<typeof vi.fn>;
  let apiClient: APIClient<typeof testDefinition>;
  let wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });
    mockResolver = vi.fn();
    apiClient = new APIClient(testDefinition, {
      resolver: mockResolver,
    });

    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
  });

  describe('Query Key Generation', () => {
    it('should use default query keys when not configured', async () => {
      const { useAPIQuery } = mountAPIQueryClient(apiClient, queryClient, {});

      const userData = { id: 1, name: 'John', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () =>
          useAPIQuery('createUser', {
            data: { name: 'John', email: 'john@example.com' },
          }),
        { wrapper },
      );

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify the hook returns the data
      expect(result.current.data).toEqual(userData);

      // Verify cache contains data with default key structure
      const defaultQueryKey = [
        'createUser',
        { name: 'John', email: 'john@example.com' },
      ];
      const cachedData = queryClient.getQueryData(defaultQueryKey);
      expect(cachedData).toEqual(userData);
    });

    it('should use custom query keys when configured', async () => {
      const config = {};

      const { useAPIQuery } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      const userData = { id: 1, name: 'John', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify the hook returns the data
      expect(result.current.data).toEqual(userData);

      // Verify cache contains data with custom key
      const customQueryKey = ['user', 1];
      const cachedData = queryClient.getQueryData(customQueryKey);
      expect(cachedData).toEqual(userData);

      // Verify default key doesn't contain the data
      const defaultKeyData = queryClient.getQueryData([
        'getUser',
        { userId: 1 },
      ]);
      expect(defaultKeyData).toBeUndefined();
    });

    it('should handle query keys for endpoints with no request data', async () => {
      const config = {};

      const { useAPIQuery } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      const usersData = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];
      mockResolver.mockResolvedValue(usersData);

      const { result } = renderHook(() => useAPIQuery('getUsers'), { wrapper });

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify the hook returns the data
      expect(result.current.data).toEqual(usersData);

      // Verify cache contains data with custom key
      const customQueryKey = ['users'];
      const cachedData = queryClient.getQueryData(customQueryKey);
      expect(cachedData).toHaveLength(2);
      expect(cachedData).toEqual(usersData);
    });
  });

  describe('Cache Invalidation on Success', () => {
    it('should invalidate specified queries after successful mutation', async () => {
      const config = {
        createUser: {
          invalidates: ({ response }: { response: any }) => [
            ['users'], // Invalidate users list
            ['user', response.id], // Invalidate specific user
          ],
        },
      };

      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      // Setup initial cache data
      queryClient.setQueryData(
        ['users'],
        [{ id: 1, name: 'John', email: 'john@example.com' }],
      );
      queryClient.setQueryData(['user', 1], {
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });

      // Mock invalidateQueries to track calls
      queryClient.invalidateQueries = vi.fn();

      const newUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      // Execute mutation
      result.current.mutate({ name: 'Jane', email: 'jane@example.com' });

      // Wait for mutation to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Wait for event handlers to execute
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify invalidation was called with correct keys
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['users'],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 2],
      });
    });

    it('should invalidate multiple query patterns', async () => {
      const config = {
        updateUser: {
          invalidates: ({
            request,
            response,
          }: {
            request: any;
            response: any;
          }) => [
            ['user', request.userId],
            ['users'],
            ['user-profile', response.id],
            ['user-posts', response.id],
          ],
        },
      };

      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      // Mock invalidation function
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

      // Execute mutation
      result.current.mutate({ userId: 1, name: 'Updated John' });

      // Wait for mutation to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Wait for event handlers
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify all specified invalidations
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
      const config = {
        updateUser: {
          errorInvalidates: ({ request }: { request: any; error: Error }) => [
            ['user', request.userId], // Invalidate potentially stale user data
            ['users'], // Invalidate list that might be outdated
          ],
        },
      };

      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      // Setup initial cache
      queryClient.setQueryData(['user', 1], {
        id: 1,
        name: 'John',
        email: 'john@example.com',
      });
      queryClient.setQueryData(
        ['users'],
        [{ id: 1, name: 'John', email: 'john@example.com' }],
      );

      // Mock invalidation function
      queryClient.invalidateQueries = vi.fn();

      // Make mutation fail
      mockResolver.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      // Execute failing mutation
      result.current.mutate({ userId: 1, name: 'Failed Update' });

      // Wait for mutation to fail
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Wait for error handlers
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify error invalidations
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user', 1],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['users'],
      });
    });

    it('should not invalidate queries when errorInvalidates is not configured', async () => {
      const config = {
        updateUser: {
          // No errorInvalidates configured
        },
      };

      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      queryClient.invalidateQueries = vi.fn();

      // Make mutation fail
      mockResolver.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      // Execute failing mutation
      result.current.mutate({ userId: 1, name: 'Failed Update' });

      // Wait for mutation to fail
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Wait for handlers
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify no invalidations occurred
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe('Complex Cache Management Scenarios', () => {
    it('should handle conditional cache operations based on response data', async () => {
      const config = {
        updateUser: {
          invalidates: ({ response }: { response: any }) => {
            const queries = [['user', response.id]];
            // Only invalidate users list if name changed
            if (response.name !== 'John') {
              queries.push(['users']);
            }
            return queries;
          },
        },
      };

      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );
      queryClient.invalidateQueries = vi.fn();

      // Test with name change
      const firstUpdate = { id: 1, name: 'Johnny', email: 'john@example.com' };
      mockResolver.mockResolvedValue(firstUpdate);

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      // Execute mutation with name change
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

      // Reset and test without name change
      vi.clearAllMocks();
      result.current.reset(); // Reset mutation state

      const secondUpdate = {
        id: 1,
        name: 'John',
        email: 'john.new@example.com',
      };
      mockResolver.mockResolvedValue(secondUpdate);

      // Execute mutation without name change
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
      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        {},
      );

      queryClient.setQueryData = vi.fn();
      queryClient.invalidateQueries = vi.fn();

      const newUser = { id: 4, name: 'Alice', email: 'alice@example.com' };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      // Execute mutation
      result.current.mutate({ name: 'Alice', email: 'alice@example.com' });

      // Wait for mutation to complete
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
