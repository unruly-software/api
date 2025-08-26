import { defineRouter } from '@unruly-software/api-server';
import { apiDefinition } from '../api-definition';
import type { UserRepo } from './user-repo';

export const router = defineRouter<
  typeof apiDefinition,
  {
    userRepo: UserRepo;
  }
>({
  definitions: apiDefinition,
});

export const createUser = router
  .endpoint('createUser')
  .handle(async ({ context, data }) => {
    return await context.userRepo.create({
      email: data.email,
      name: data.name,
    });
  });

export const getUser = router
  .endpoint('getUser')
  .handle(async ({ context, data }) => {
    if (data.userId <= 0) {
      throw new Error('Invalid user ID');
    }
    return await context.userRepo.get(data.userId);
  });
