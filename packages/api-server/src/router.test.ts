import { defineAPI } from '@unruly-software/api-client';
import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { defineRouter } from './router';

const spec = defineAPI<{ path: string }>();

const api = {
  login: spec.defineEndpoint({
    request: z.object({
      email: z.string().email(),
      password: z.string(),
    }),
    response: z.object({
      token: z.string(),
    }),
    metadata: {
      path: '/login',
    },
  }),

  logout: spec.defineEndpoint({
    request: null,
    response: null,
    metadata: {
      path: '/logout',
    },
  }),
};

type UserRepo = {
  get(id: string): Promise<{ id: string; token: string } | null>;
};

const router = defineRouter<typeof api, { userRepo: UserRepo }>({
  definitions: api,
});

const login = router
  .endpoint('login')
  .updateContext(async (ctx) => ({
    ...ctx,
    userId: '123',
  }))
  .handle(async ({ context, data, definition }) => {
    expectTypeOf(definition).toEqualTypeOf<typeof api.login>();
    expectTypeOf(data).toEqualTypeOf<{ email: string; password: string }>();
    expectTypeOf(context).toEqualTypeOf<{
      userId: string;
      userRepo: UserRepo;
    }>();

    const user = await context.userRepo.get(data.email);
    if (!user) {
      throw new Error('User not found');
    }
    return { token: user.token };
  });

const logout = router
  .endpoint('logout')
  .handle(async ({ context, data, definition }) => {
    expectTypeOf(definition).toEqualTypeOf<typeof api.logout>();
    expectTypeOf(data).toEqualTypeOf<never>();
    expectTypeOf(context).toEqualTypeOf<{ userRepo: UserRepo }>();
  });

const implementedRouter = router.implement({
  endpoints: {
    login,
    logout,
  },
});

describe('router', () => {
  it.skip('should pass type tests', () => {
    expectTypeOf<
      Parameters<typeof implementedRouter.endpoints.login.handle>
    >().toEqualTypeOf<
      [
        input: {
          context: { userRepo: UserRepo };
          data: { email: string; password: string };
        },
      ]
    >();

    expectTypeOf<
      Parameters<typeof implementedRouter.endpoints.logout.handle>
    >().toEqualTypeOf<
      [input: { context: { userRepo: UserRepo }; data: never }]
    >();

    expectTypeOf<
      ReturnType<typeof implementedRouter.endpoints.login.handle>
    >().toEqualTypeOf<Promise<{ token: string }>>();

    expectTypeOf<
      ReturnType<typeof implementedRouter.endpoints.logout.handle>
    >().toEqualTypeOf<Promise<void>>();
  });
});
