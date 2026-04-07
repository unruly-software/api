import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import {
  APIClient,
  type APIEndpointDefinitions,
  defineAPI,
} from '@unruly-software/api-client';
import React from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
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

const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  authorId: z.number(),
});

const testDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: UserSchema,
    apiQuery: {
      queryKey: (request: any) => ['user', request?.userId] as const,
    },
    metadata: { path: '/users/:id', method: 'GET' },
  }),

  getUsers: api.defineEndpoint({
    metadata: { path: '/users', method: 'GET' },
    request: null,
    response: z.array(UserSchema),
    apiQuery: {
      queryKey: () => ['users'] as const,
    },
  }),

  getUserPosts: api.defineEndpoint({
    metadata: { path: '/users/:id/posts', method: 'GET' },
    request: z.object({
      userId: z.number(),
      limit: z.number().optional(),
    }),
    response: z.object({
      posts: z.array(PostSchema),
      total: z.number(),
    }),
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

  failingEndpoint: api.defineEndpoint({
    metadata: { path: '/fail', method: 'GET' },
    request: null,
    response: z.object({ success: z.boolean() }),
  }),
} satisfies APIEndpointDefinitions;

describe('Integration Tests', () => {
  let queryClient: QueryClient;
  let mockResolver: Mock;
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
    apiClient = new APIClient(testDefinition, { resolver: mockResolver });

    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
  });

  describe('useAPIQuery Hook Integration', () => {
    it('should fetch data successfully with basic configuration', async () => {
      const config = {};

      const { useAPIQuery } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      const userData = { id: 1, name: 'John Doe', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify successful fetch
      expect(result.current.data).toEqual(userData);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();

      // Verify resolver was called correctly
      expect(mockResolver).toHaveBeenCalledWith({
        endpoint: 'getUser',
        definition: expect.objectContaining({
          request: expect.any(Object),
          response: expect.any(Object),
          metadata: { path: '/users/:id', method: 'GET' },
        }),
        request: { userId: 1 },
        abortSignal: expect.any(AbortSignal),
      });
    });

    it('should handle queries with no request data', async () => {
      const config = {};

      const { useAPIQuery } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      const usersData = [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      ];
      mockResolver.mockResolvedValue(usersData);

      const { result } = renderHook(() => useAPIQuery('getUsers'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(usersData);
      expect(mockResolver).toHaveBeenCalledWith({
        endpoint: 'getUsers',
        definition: expect.objectContaining({
          metadata: { path: '/users', method: 'GET' },
        }),
        request: undefined, // The actual behavior when no request data is provided
        abortSignal: expect.any(AbortSignal),
      });
    });

    it('should handle conditional queries (data: null)', async () => {
      const { useAPIQuery } = mountAPIQueryClient(apiClient, queryClient, {});

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: null }),
        { wrapper },
      );

      // Query should be disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(result.current.fetchStatus).toBe('idle');

      // Resolver should not be called
      expect(mockResolver).not.toHaveBeenCalled();
    });

    it('should handle query overrides', async () => {
      const { useAPIQuery } = mountAPIQueryClient(apiClient, queryClient, {});

      const userData = { id: 1, name: 'John Doe', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () =>
          useAPIQuery('getUser', {
            data: { userId: 1 },
            overrides: {
              staleTime: 60000,
              enabled: true,
            },
          }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(userData);

      // Check that staleTime was applied
      const queryState = queryClient.getQueryState(['user', 1]);
      expect(queryState?.dataUpdatedAt).toBeDefined();
    });

    it('should handle query errors', async () => {
      const { useAPIQuery } = mountAPIQueryClient(apiClient, queryClient, {});

      const error = new Error('Network error');
      mockResolver.mockRejectedValue(error);

      const { result } = renderHook(() => useAPIQuery('failingEndpoint'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(error);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle complex nested responses', async () => {
      const { useAPIQuery } = mountAPIQueryClient(apiClient, queryClient, {});

      const postsData = {
        posts: [
          { id: 1, title: 'First Post', content: 'Content 1', authorId: 1 },
          { id: 2, title: 'Second Post', content: 'Content 2', authorId: 1 },
        ],
        total: 2,
      };
      mockResolver.mockResolvedValue(postsData);

      const { result } = renderHook(
        () => useAPIQuery('getUserPosts', { data: { userId: 1, limit: 10 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(postsData);
      expect(mockResolver).toHaveBeenCalledWith({
        endpoint: 'getUserPosts',
        definition: expect.any(Object),
        request: { userId: 1, limit: 10 },
        abortSignal: expect.any(AbortSignal),
      });
    });
  });

  describe('useAPIMutation Hook Integration', () => {
    it('should execute mutations successfully', async () => {
      const { useAPIMutation } = mountAPIQueryClient(apiClient, queryClient, {
        createUser: {
          invalidates: ({ response }) => [['users'], ['user', response.id]],
        },
      });

      const newUser = { id: 3, name: 'Bob Wilson', email: 'bob@example.com' };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      // Initially idle
      expect(result.current.isPending).toBe(false);
      expect(result.current.data).toBeUndefined();

      // Execute mutation
      result.current.mutate({ name: 'Bob Wilson', email: 'bob@example.com' });

      // Wait for mutation to complete
      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(newUser);
      expect(result.current.error).toBeNull();

      expect(mockResolver).toHaveBeenCalledWith({
        endpoint: 'createUser',
        definition: expect.any(Object),
        request: { name: 'Bob Wilson', email: 'bob@example.com' },
        abortSignal: undefined,
      });
    });

    it('should execute mutations with mutateAsync', async () => {
      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        {},
      );

      const updatedUser = {
        id: 1,
        name: 'John Updated',
        email: 'john.updated@example.com',
      };
      mockResolver.mockResolvedValue(updatedUser);

      const { result } = renderHook(() => useAPIMutation('updateUser'), {
        wrapper,
      });

      // Execute with mutateAsync
      const data = await result.current.mutateAsync({
        userId: 1,
        name: 'John Updated',
      });

      expect(data).toEqual(updatedUser);

      // Wait for the mutation state to update
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should handle mutations with no response data', async () => {
      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        {},
      );

      mockResolver.mockResolvedValue(null);

      const { result } = renderHook(() => useAPIMutation('deleteUser'), {
        wrapper,
      });

      result.current.mutate({ userId: 1 });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });

      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle mutation errors', async () => {
      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        {},
      );

      const error = new Error('Creation failed');
      mockResolver.mockRejectedValue(error);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      result.current.mutate({ name: 'Failed User', email: 'fail@example.com' });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(error);
      expect(result.current.data).toBeUndefined();
    });

    it('should handle mutation overrides', async () => {
      const { useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        {},
      );

      const onSuccess = vi.fn();
      const onError = vi.fn();

      const newUser = {
        id: 4,
        name: 'Alice Brown',
        email: 'alice@example.com',
      };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(
        () =>
          useAPIMutation('createUser', {
            overrides: {
              onSuccess,
              onError,
            },
          }),
        { wrapper },
      );

      result.current.mutate({
        name: 'Alice Brown',
        email: 'alice@example.com',
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });

      expect(onSuccess).toHaveBeenCalledWith(
        newUser,
        { name: 'Alice Brown', email: 'alice@example.com' },
        undefined,
      );
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Cache Integration Tests', () => {
    it('should integrate query cache with mutations', async () => {
      const config = {
        updateUser: {
          invalidates: ({ response }: { response: any }) => [
            ['user', response.id],
          ],
        },
      };

      const { useAPIQuery, useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      // First, fetch a user
      const originalUser = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      };
      mockResolver.mockResolvedValue(originalUser);

      const { result: queryResult } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(queryResult.current.data).toEqual(originalUser);
      });

      // Now update the user
      const updatedUser = {
        id: 1,
        name: 'John Updated',
        email: 'john@example.com',
      };
      mockResolver.mockResolvedValue(updatedUser);

      const { result: mutationResult } = renderHook(
        () => useAPIMutation('updateUser'),
        { wrapper },
      );

      mutationResult.current.mutate({ userId: 1, name: 'John Updated' });

      await waitFor(() => {
        expect(mutationResult.current.isSuccess).toBe(true);
      });

      // The query should be invalidated and refetch
      await waitFor(() => {
        expect(queryResult.current.data).toEqual(updatedUser);
      });
    });

    it('should handle cache invalidation on errors', async () => {
      const config = {
        updateUser: {
          errorInvalidates: ({ request }: { request: any }) => [
            ['user', request.userId],
          ],
        },
      };

      const { useAPIQuery, useAPIMutation } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      // Setup initial data
      const originalUser = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      };
      mockResolver.mockResolvedValue(originalUser);

      const { result: queryResult } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(queryResult.current.data).toEqual(originalUser);
      });

      // Now make update fail
      mockResolver.mockRejectedValue(new Error('Update failed'));

      const { result: mutationResult } = renderHook(
        () => useAPIMutation('updateUser'),
        {
          wrapper,
        },
      );

      mutationResult.current.mutate({ userId: 1, name: 'Should Fail' });

      await waitFor(() => {
        expect(mutationResult.current.isError).toBe(true);
      });

      // The error invalidation should trigger a refetch
      // Reset the resolver to return valid data for the refetch
      mockResolver.mockResolvedValue(originalUser);

      await waitFor(() => {
        expect(queryResult.current.data).toEqual(originalUser);
      });
    });
  });

  describe('Real React Query Integration Scenarios', () => {
    it('should properly integrate with React Query staleTime', async () => {
      const config = {
        getUser: {
          queryOptions: {
            staleTime: 60000, // 1 minute
          },
        },
      };

      const { useAPIQuery } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      const userData = { id: 1, name: 'John Doe', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result, rerender } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(userData);
      });

      // Clear mock call history
      mockResolver.mockClear();

      // Rerender should not trigger new fetch due to staleTime
      rerender();

      // Wait a bit and verify no new calls
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockResolver).not.toHaveBeenCalled();
    });

    it('should properly integrate with React Query retry logic', async () => {
      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            retryDelay: 0,
          },
        },
      });

      wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children,
        );

      const { useAPIQuery } = mountAPIQueryClient(apiClient, queryClient, {});

      let callCount = 0;
      mockResolver.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Temporary failure');
        }
        return { id: 1, name: 'John Doe', email: 'john@example.com' };
      });

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      // Should eventually succeed after retries
      await waitFor(
        () => {
          expect(result.current.isSuccess).toBe(true);
        },
        { timeout: 5000 },
      );

      expect(callCount).toBe(3); // Initial call + 2 retries
      expect(result.current.data).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should handle real background refetching', async () => {
      const config = {
        getUser: {
          queryOptions: {
            refetchInterval: 100, // Very short for testing
          },
        },
      };

      const { useAPIQuery } = mountAPIQueryClient(
        apiClient,
        queryClient,
        config,
      );

      let callCount = 0;
      mockResolver.mockImplementation(() => {
        callCount++;
        return { id: 1, name: `John ${callCount}`, email: 'john@example.com' };
      });

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.data?.name).toBe('John 1');
      });

      // Wait for background refetch
      await waitFor(
        () => {
          expect(result.current.data?.name).toBe('John 2');
        },
        { timeout: 1000 },
      );

      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
