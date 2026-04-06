import * as net from 'node:net';
import { APIClient } from '@unruly-software/api-client';
import { jsonPlaceholderAPI } from '@unruly-software/api-example-existing-api';
import { describe, expect, it } from 'vitest';
import { startServer } from './server';

function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const createTestAPIClient = (baseUrl: string) => {
  return new APIClient(jsonPlaceholderAPI, {
    resolver: async ({ endpoint, request, abortSignal }) => {
      const fetchOptions: RequestInit = {
        method: 'POST',
        signal: abortSignal,
      };

      // Only set content-type and body if we have request data
      if (request !== undefined && request !== null) {
        fetchOptions.headers = {
          'Content-Type': 'application/json',
        };
        fetchOptions.body = JSON.stringify(request);
      }

      const result = await fetch(`${baseUrl}/api/${endpoint}`, fetchOptions);

      if (!result.ok) {
        let error = new Error(
          `API request failed with status ${result.status}`,
        );
        try {
          const body = await result.json();
          if (body?.error) {
            error = new Error(body.error);
          }
        } catch {}

        throw error;
      }

      return result.json();
    },
  });
};

describe('fastify server with JSONPlaceholder API', async () => {
  it('should implement all JSONPlaceholder endpoints correctly', async () => {
    const port = await getPort();
    const server = await startServer(port);

    try {
      const client = createTestAPIClient(`http://127.0.0.1:${port}`);

      // Test getUsers endpoint
      const users = await client.request('getUsers', { request: undefined });
      expect(users).toHaveLength(2);
      expect(users[0]).toMatchObject({
        id: 1,
        name: 'Leanne Graham',
        username: 'Bret',
        email: 'sincere@april.biz',
      });

      // Test getPosts endpoint
      const posts = await client.request('getPosts', { request: undefined });
      expect(posts).toHaveLength(3);
      expect(posts[0]).toMatchObject({
        userId: 1,
        id: 1,
        title: expect.any(String),
        body: expect.any(String),
      });

      // Test getPost endpoint
      const post = await client.request('getPost', {
        request: { id: 1 },
      });
      expect(post).toMatchObject({
        userId: 1,
        id: 1,
        title:
          'sunt aut facere repellat provident occaecati excepturi optio reprehenderit',
      });

      // Test getPost with non-existent ID should throw
      await expect(
        client.request('getPost', { request: { id: 999 } }),
      ).rejects.toThrow('Post with id 999 not found');

      // Test createPost endpoint
      const newPost = await client.request('createPost', {
        request: {
          title: 'Test Post',
          body: 'This is a test post created by the test suite',
          userId: 1,
        },
      });
      expect(newPost).toMatchObject({
        id: 4, // Should be the next ID after seeded data
        title: 'Test Post',
        body: 'This is a test post created by the test suite',
        userId: 1,
      });

      // Test createPost with non-existent user should throw
      await expect(
        client.request('createPost', {
          request: {
            title: 'Invalid Post',
            body: 'This should fail',
            userId: 999,
          },
        }),
      ).rejects.toThrow('User with id 999 not found');

      // Test getComments endpoint
      const comments = await client.request('getComments', {
        request: { postId: 1 },
      });
      expect(comments).toHaveLength(2); // Based on seed data
      expect(comments[0]).toMatchObject({
        postId: 1,
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
        body: expect.any(String),
      });

      // Test getComments with non-existent post should throw
      await expect(
        client.request('getComments', { request: { postId: 999 } }),
      ).rejects.toThrow('Post with id 999 not found');

      // Verify that the newly created post is included in getPosts
      const updatedPosts = await client.request('getPosts', {
        request: undefined,
      });
      expect(updatedPosts).toHaveLength(4);
      const createdPost = updatedPosts.find((p: any) => p.id === 4);
      expect(createdPost).toBeDefined();
      expect(createdPost?.title).toBe('Test Post');
    } finally {
      await server.close();
    }
  });

  it('should handle health check endpoint as well (not in the schema)', async () => {
    const port = await getPort();
    const server = await startServer(port);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });
});
