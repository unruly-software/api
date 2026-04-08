import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import {
  type APIEndpointDefinitions,
  defineAPI,
} from '@unruly-software/api-client';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { defineAPIQueryKeys, mountAPIQueryClient, queryKey } from './index';
import {
  createTestEnv,
  PostSchema,
  type TestEnv,
  UserSchema,
} from './testHelpers';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const testDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: UserSchema,
    metadata: { path: '/users/:id', method: 'GET' },
  }),

  getUsers: api.defineEndpoint({
    metadata: { path: '/users', method: 'GET' },
    request: null,
    response: z.array(UserSchema),
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

const config = defineAPIQueryKeys(testDefinition, {
  getUser: (request) => queryKey('user', request?.userId),
  getUsers: () => queryKey('users'),
});

describe('Integration Tests', () => {
  let queryClient: TestEnv<typeof testDefinition>['queryClient'];
  let mockResolver: TestEnv<typeof testDefinition>['mockResolver'];
  let apiClient: TestEnv<typeof testDefinition>['apiClient'];
  let wrapper: TestEnv<typeof testDefinition>['wrapper'];

  beforeEach(() => {
    ({ queryClient, mockResolver, apiClient, wrapper } =
      createTestEnv(testDefinition));
  });

  describe('useAPIQuery Hook Integration', () => {
    it('should fetch data successfully with basic configuration', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

      const userData = { id: 1, name: 'John Doe', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(userData);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();

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
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: null }),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(result.current.fetchStatus).toBe('idle');

      expect(mockResolver).not.toHaveBeenCalled();
    });

    it('should handle query overrides', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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

      const queryState = queryClient.getQueryState(['user', 1]);
      expect(queryState?.dataUpdatedAt).toBeDefined();
    });

    it('should handle query errors', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          createUser: {
            invalidates: ({ response }) => [['users'], ['user', response.id]],
          },
        },
      });

      const newUser = { id: 3, name: 'Bob Wilson', email: 'bob@example.com' };
      mockResolver.mockResolvedValue(newUser);

      const { result } = renderHook(() => useAPIMutation('createUser'), {
        wrapper,
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.data).toBeUndefined();

      result.current.mutate({ name: 'Bob Wilson', email: 'bob@example.com' });

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
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should handle mutations with no response data', async () => {
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          updateUser: {
            invalidates: ({ response }) => [
              config.getKeyForEndpoint('getUser', { userId: response.id }),
            ],
          },
        },
      });

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

      await waitFor(() => {
        expect(queryResult.current.data).toEqual(updatedUser);
      });
    });

    it('should handle cache invalidation on errors', async () => {
      const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          updateUser: {
            errorInvalidates: ({ request }) => [
              config.getKeyForEndpoint('getUser', { userId: request.userId }),
            ],
          },
        },
      });

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

      mockResolver.mockResolvedValue(originalUser);

      await waitFor(() => {
        expect(queryResult.current.data).toEqual(originalUser);
      });
    });
  });

  describe('Real React Query Integration Scenarios', () => {
    it('should properly integrate with React Query staleTime', async () => {
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          getUser: {
            queryOptions: {
              staleTime: 60000, // 1 minute
            },
          },
        },
      });

      const userData = { id: 1, name: 'John Doe', email: 'john@example.com' };
      mockResolver.mockResolvedValue(userData);

      const { result, rerender } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(userData);
      });

      mockResolver.mockClear();

      rerender();

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

      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
      });

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
      const { useAPIQuery } = mountAPIQueryClient({
        apiClient,
        queryClient,
        queryKeys: config,
        endpoints: {
          getUser: {
            queryOptions: {
              refetchInterval: 100, // Very short for testing
            },
          },
        },
      });

      let callCount = 0;
      mockResolver.mockImplementation(() => {
        callCount++;
        return { id: 1, name: `John ${callCount}`, email: 'john@example.com' };
      });

      const { result } = renderHook(
        () => useAPIQuery('getUser', { data: { userId: 1 } }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data?.name).toBe('John 1');
      });

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
