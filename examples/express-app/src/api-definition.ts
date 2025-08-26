import { defineAPI } from '@unruly-software/api-client';
import z from 'zod';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

export const apiDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({
      userId: z.number(),
    }),
    response: userSchema.or(z.null()),
    metadata: {
      method: 'POST',
      path: '/user/getUser',
    },
  }),

  createUser: api.defineEndpoint({
    request: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    response: userSchema,
    metadata: {
      method: 'POST',
      path: '/user/createUser',
    },
  }),
};
