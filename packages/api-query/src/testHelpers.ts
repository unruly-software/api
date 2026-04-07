import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  APIClient,
  type APIEndpointDefinitions,
} from '@unruly-software/api-client';
import React from 'react';
import { type Mock, vi } from 'vitest';
import z from 'zod';

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

export const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  authorId: z.number(),
});

export type TestEnv<API extends APIEndpointDefinitions> = {
  queryClient: QueryClient;
  mockResolver: Mock;
  apiClient: APIClient<API>;
  wrapper: React.ComponentType<{ children: React.ReactNode }>;
};

export const createTestEnv = <API extends APIEndpointDefinitions>(
  api: API,
): TestEnv<API> => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const mockResolver = vi.fn();
  const apiClient = new APIClient(api, { resolver: mockResolver });
  const wrapper: React.ComponentType<{ children: React.ReactNode }> = ({
    children,
  }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, mockResolver, apiClient, wrapper };
};
