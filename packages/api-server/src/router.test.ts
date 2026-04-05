import { defineAPI } from '@unruly-software/api-client';
import { describe, expect, expectTypeOf, it } from 'vitest';
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
  .handle(async ({ context, data, definition }) => {
    expectTypeOf(definition).toEqualTypeOf<typeof api.login>();
    expectTypeOf(data).toEqualTypeOf<{ email: string; password: string }>();
    expectTypeOf(context).toEqualTypeOf<{ userRepo: UserRepo }>();

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
  const userRepo: UserRepo = {
    get: async (id: string) => ({ id, token: 'valid-token' }),
  };

  it('should dispatch login events', async () => {
    const result = await implementedRouter.dispatch({
      endpoint: 'login',
      context: { userRepo },
      data: { email: 'email@email.com', password: '123' },
    });

    expect(result).toEqual({ token: 'valid-token' });
    expectTypeOf(result).toEqualTypeOf<{ token: string }>();
  });

  it('should fail if an unknown endpoint is dispatched', async () => {
    await expect(
      implementedRouter.dispatch({
        // @ts-expect-error Testing runtime failure
        endpoint: 'spaghetti',
        context: { userRepo },
        data: {
          email: '',
          password: '',
        },
      }),
    ).rejects.toMatchInlineSnapshot(
      '[Error: No definition for endpoint spaghetti]',
    );
  });
});
