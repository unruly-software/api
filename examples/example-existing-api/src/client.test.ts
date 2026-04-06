import { describe, expect, it } from 'vitest';
import { jsonPlaceholderClient } from './client';
import type { Comment, Post, User } from './schemas';

describe('JSONPlaceholder API Client Integration Tests', () => {
  it('should fetch all posts', async () => {
    const posts = await jsonPlaceholderClient.request('getPosts', {
      request: undefined,
    });

    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);

    const firstPost = posts[0] as Post;
    expect(firstPost).toHaveProperty('id');
    expect(firstPost).toHaveProperty('userId');
    expect(firstPost).toHaveProperty('title');
    expect(firstPost).toHaveProperty('body');
    expect(typeof firstPost.id).toBe('number');
    expect(typeof firstPost.userId).toBe('number');
    expect(typeof firstPost.title).toBe('string');
    expect(typeof firstPost.body).toBe('string');
  });

  it('should fetch a single post by id', async () => {
    const post = await jsonPlaceholderClient.request('getPost', {
      request: { id: 1 },
    });

    expect(post).toHaveProperty('id', 1);
    expect(post).toHaveProperty('userId');
    expect(post).toHaveProperty('title');
    expect(post).toHaveProperty('body');
    expect(typeof post.userId).toBe('number');
    expect(typeof post.title).toBe('string');
    expect(typeof post.body).toBe('string');
  });

  it('should create a new post', async () => {
    const newPost = {
      title: 'Test Post from API Client',
      body: 'This is a test post created by our API client integration test.',
      userId: 1,
    };

    const createdPost = await jsonPlaceholderClient.request('createPost', {
      request: newPost,
    });

    expect(createdPost).toHaveProperty('id');
    expect(createdPost.title).toBe(newPost.title);
    expect(createdPost.body).toBe(newPost.body);
    expect(createdPost.userId).toBe(newPost.userId);
    expect(typeof createdPost.id).toBe('number');
  });

  it('should fetch comments for a specific post', async () => {
    const comments = await jsonPlaceholderClient.request('getComments', {
      request: { postId: 1 },
    });

    expect(Array.isArray(comments)).toBe(true);
    expect(comments.length).toBeGreaterThan(0);

    const firstComment = comments[0] as Comment;
    expect(firstComment).toHaveProperty('id');
    expect(firstComment).toHaveProperty('postId', 1);
    expect(firstComment).toHaveProperty('name');
    expect(firstComment).toHaveProperty('email');
    expect(firstComment).toHaveProperty('body');
    expect(typeof firstComment.id).toBe('number');
    expect(typeof firstComment.name).toBe('string');
    expect(typeof firstComment.email).toBe('string');
    expect(typeof firstComment.body).toBe('string');
  });

  it('should fetch all users', async () => {
    const users = await jsonPlaceholderClient.request('getUsers', {
      request: undefined,
    });

    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);

    const firstUser = users[0] as User;
    expect(firstUser).toHaveProperty('id');
    expect(firstUser).toHaveProperty('name');
    expect(firstUser).toHaveProperty('username');
    expect(firstUser).toHaveProperty('email');
    expect(firstUser).toHaveProperty('address');
    expect(firstUser).toHaveProperty('phone');
    expect(firstUser).toHaveProperty('website');
    expect(firstUser).toHaveProperty('company');

    // Validate nested address structure
    expect(firstUser.address).toHaveProperty('street');
    expect(firstUser.address).toHaveProperty('suite');
    expect(firstUser.address).toHaveProperty('city');
    expect(firstUser.address).toHaveProperty('zipcode');
    expect(firstUser.address).toHaveProperty('geo');
    expect(firstUser.address.geo).toHaveProperty('lat');
    expect(firstUser.address.geo).toHaveProperty('lng');

    // Validate nested company structure
    expect(firstUser.company).toHaveProperty('name');
    expect(firstUser.company).toHaveProperty('catchPhrase');
    expect(firstUser.company).toHaveProperty('bs');
  });

  it('should handle request abortion', async () => {
    const abortController = new AbortController();

    // Abort the request immediately to simulate cancellation
    abortController.abort();

    const requestPromise = jsonPlaceholderClient.request('getPosts', {
      request: undefined,
      abort: abortController.signal,
    });

    await expect(requestPromise).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AbortError: This operation was aborted]`,
    );
  });

  it('should publish success events', async () => {
    let successEventReceived = false;
    let successData: any = null;

    // Subscribe to success events for the client instance
    const unsubscribe = jsonPlaceholderClient.$succeeded.subscribe((event) => {
      successEventReceived = true;
      successData = event;
    });

    try {
      await jsonPlaceholderClient.request('getPost', {
        request: { id: 1 },
      });

      expect(successEventReceived).toBe(true);
      expect(successData).toHaveProperty('endpoint', 'getPost');
      expect(successData).toHaveProperty('request', { id: 1 });
      expect(successData).toHaveProperty('response');
      expect(successData.response).toHaveProperty('id', 1);
    } finally {
      unsubscribe();
    }
  });
});
