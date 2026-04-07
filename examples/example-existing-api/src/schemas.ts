import { z } from 'zod';

const numberString = z
  .string()
  .refine((val) => !Number.isNaN(Number(val)), {
    message: 'Expected a string that can be converted to a number',
  })
  .transform((v) => Number(v))
  .or(z.number());

export const PostSchema = z.object({
  userId: numberString,
  id: numberString,
  title: z.string(),
  body: z.string(),
});

export const CommentSchema = z.object({
  postId: numberString,
  id: numberString,
  name: z.string(),
  email: z.string().email(),
  body: z.string(),
});

export const UserSchema = z.object({
  id: numberString,
  name: z.string(),
  username: z.string(),
  email: z.string().email(),
  address: z.object({
    street: z.string(),
    suite: z.string(),
    city: z.string(),
    zipcode: z.string(),
    geo: z.object({
      lat: z.string(),
      lng: z.string(),
    }),
  }),
  phone: z.string(),
  website: z.string(),
  company: z.object({
    name: z.string(),
    catchPhrase: z.string(),
    bs: z.string(),
  }),
});

export const GetPostParamsSchema = z.object({
  id: numberString,
});

export const GetCommentsParamsSchema = z.object({
  postId: numberString,
});

export type Post = z.infer<typeof PostSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type User = z.infer<typeof UserSchema>;
export type GetPostParams = z.infer<typeof GetPostParamsSchema>;
export type GetCommentsParams = z.infer<typeof GetCommentsParamsSchema>;
