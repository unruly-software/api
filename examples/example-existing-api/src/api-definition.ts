import { defineAPI } from '@unruly-software/api-client';
import { z } from 'zod';
import {
  CommentSchema,
  GetCommentsParamsSchema,
  GetPostParamsSchema,
  PostSchema,
  UserSchema,
} from './schemas.js';

const { defineEndpoint } = defineAPI<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
}>();

export const jsonPlaceholderAPI = {
  getPosts: defineEndpoint({
    request: null,
    response: z.array(PostSchema),
    metadata: {
      method: 'GET',
      path: '/posts',
    },
  }),

  getPost: defineEndpoint({
    request: GetPostParamsSchema,
    response: PostSchema,
    metadata: {
      method: 'GET',
      path: '/posts/{id}',
    },
  }),

  createPost: defineEndpoint({
    request: z.object({
      title: z.string(),
      body: z.string(),
      userId: z.number(),
    }),
    response: PostSchema,
    metadata: {
      method: 'POST',
      path: '/posts',
    },
  }),

  getComments: defineEndpoint({
    request: GetCommentsParamsSchema,
    response: z.array(CommentSchema),
    metadata: {
      method: 'GET',
      path: '/posts/{postId}/comments',
    },
  }),

  getUsers: defineEndpoint({
    request: null,
    response: z.array(UserSchema),
    metadata: {
      method: 'GET',
      path: '/users',
    },
  }),
} as const;
