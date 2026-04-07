import { jsonPlaceholderAPI } from '@unruly-software/api-example-existing-api';
import { defineRouter } from '@unruly-software/api-server';
import type { CommentRepo, PostRepo, UserRepo } from './repositories';

// Define the context type for dependency injection
export type AppContext = {
  userRepo: UserRepo;
  postRepo: PostRepo;
  commentRepo: CommentRepo;
};

// Create the router with the JSONPlaceholder API definition and our context type
export const router = defineRouter<typeof jsonPlaceholderAPI, AppContext>({
  definitions: jsonPlaceholderAPI,
});

// Implement endpoint handlers
export const getPosts = router
  .endpoint('getPosts')
  .handle(async ({ context }) => {
    return await context.postRepo.getAll();
  });

export const getPost = router
  .endpoint('getPost')
  .handle(async ({ context, data }) => {
    const post = await context.postRepo.getById(data.id);
    if (!post) {
      throw new Error(`Post with id ${data.id} not found`);
    }
    return post;
  });

export const createPost = router
  .endpoint('createPost')
  .handle(async ({ context, data }) => {
    // Validate that the userId exists
    const user = await context.userRepo.getById(data.userId);
    if (!user) {
      throw new Error(`User with id ${data.userId} not found`);
    }

    return await context.postRepo.create({
      userId: data.userId,
      title: data.title,
      body: data.body,
    });
  });

export const getComments = router
  .endpoint('getComments')
  .handle(async ({ context, data }) => {
    // Validate that the post exists
    const post = await context.postRepo.getById(data.postId);
    if (!post) {
      throw new Error(`Post with id ${data.postId} not found`);
    }

    return await context.commentRepo.getByPostId(data.postId);
  });

export const getUsers = router
  .endpoint('getUsers')
  .handle(async ({ context }) => {
    return await context.userRepo.getAll();
  });

// Create the implemented router with all endpoint handlers
export const implementedRouter = router.implement({
  endpoints: {
    getPosts,
    getPost,
    createPost,
    getComments,
    getUsers,
  },
});
