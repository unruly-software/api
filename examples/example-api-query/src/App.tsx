import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  jsonPlaceholderAPI,
  jsonPlaceholderClient,
} from '@unruly-software/api-example-existing-api';
import {
  defineAPIQueryKeys,
  mountAPIQueryClient,
} from '@unruly-software/api-query';
import { useState } from 'react';
import { PostsList } from './components/PostsList';
import { UsersList } from './components/UsersList';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 0,
    },
  },
});

const config = defineAPIQueryKeys(jsonPlaceholderAPI, {});

export const { useAPIQuery, useAPIMutation } = mountAPIQueryClient({
  apiClient: jsonPlaceholderClient,
  queryClient,
  queryKeys: config,
  endpoints: {
    createPost: {
      invalidates: () => [config.getKeyForEndpoint('getPosts')],
      mutationOptions: {},
    },
  },
});
jsonPlaceholderClient.$succeeded.subscribe(
  ({ endpoint, request, response }) => {
    console.log(`API call to ${endpoint} succeeded`, { request, response });
  },
);
jsonPlaceholderClient.$failed.subscribe(({ endpoint, request, error }) => {
  console.error(`API call to ${endpoint} failed`, { request, error });
});

export function App() {
  const [activeTab, setActiveTab] = useState<'posts' | 'users'>('posts');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <header className="header">
          <h1>API Query Demo</h1>
          <p>Demonstrating @unruly-software/api-query with React Query</p>
          <nav className="nav-tabs">
            <button
              type="button"
              className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              Posts
            </button>
            <button
              type="button"
              className={`tab ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Users
            </button>
          </nav>
        </header>

        <main className="main-content">
          {activeTab === 'posts' && <PostsList />}
          {activeTab === 'users' && <UsersList />}
        </main>
        <ReactQueryDevtools initialIsOpen={false} />
      </div>
    </QueryClientProvider>
  );
}
