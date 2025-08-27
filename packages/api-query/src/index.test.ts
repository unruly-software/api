import { QueryClient } from '@tanstack/react-query';
import { APIClient, defineAPI } from '@unruly-software/api-client';
import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { mountAPIQueryClient } from '.';

const api = defineAPI();

const UserSchema = z.object({
  userId: z.number().transform((n) => n.toString()),
  name: z.string(),
});

const definition = {
  health: api.defineEndpoint({
    metadata: {},
    request: null,
    response: null,
  }),

  getUser: api.defineEndpoint({
    metadata: {},
    request: z.object({ userId: z.number().transform((n) => n.toString()) }),
    response: UserSchema,
  }),

  createUser: api.defineEndpoint({
    metadata: {},
    request: z.object({ name: z.string() }),
    response: UserSchema,
  }),
};

const qc = new QueryClient();
const { useAPIQuery, useAPIMutation } = mountAPIQueryClient(
  new APIClient(definition, { resolver: null as any }),
  qc,
  {
    createUser: {
      invalidates: ({ response }) => [['user', response.userId]],
    },
    getUser: {
      queryKey: ({ request }) => ['user', request?.userId],
    },
    health: {
      queryKey: () => ['health'],
    },
  },
);

describe('react-query integration', () => {
  it.skip(`should pass type tests for ${useAPIQuery.name}`, () => {
    expectTypeOf(useAPIQuery).toBeFunction();
    expectTypeOf<Parameters<typeof useAPIQuery>[0]>().toEqualTypeOf<
      'health' | 'getUser' | 'createUser'
    >();

    const getUser = useAPIQuery('getUser', { data: { userId: 6 } });

    useAPIQuery('getUser', {
      data: null,
      overrides: {
        staleTime: 1000,
      },
    });

    expectTypeOf(getUser.error).toEqualTypeOf<Error | null>();
    expectTypeOf(getUser.data).toEqualTypeOf<
      | {
          userId: string;
          name: string;
        }
      | undefined
    >();

    // @ts-expect-error
    useAPIQuery('getUser', { data: { userId: 666, name: 'hello' } });
    // @ts-expect-error
    useAPIQuery('getUser', { data: {} });
    // @ts-expect-error
    useAPIQuery('getUser', {});
    // @ts-expect-error
    useAPIQuery('getUser');

    useAPIQuery('health', {});
    useAPIQuery('health', { data: null, overrides: { enabled: true } });

    const healthResult = useAPIQuery('health');
    expectTypeOf(healthResult.data).toEqualTypeOf<undefined>();
    expectTypeOf(healthResult.error).toEqualTypeOf<Error | null>();
  });

  it.skip(`should pass type tests for ${useAPIMutation.name}`, () => {
    expectTypeOf(useAPIMutation).toBeFunction();
    expectTypeOf<Parameters<typeof useAPIMutation>[0]>().toEqualTypeOf<
      'health' | 'getUser' | 'createUser'
    >();

    const createUser = useAPIMutation('createUser', {
      overrides: {
        onSuccess: (data, variables, context) => {
          expectTypeOf(data).toEqualTypeOf<{ userId: string; name: string }>();
          expectTypeOf(variables).toEqualTypeOf<{ name: string }>();
          expectTypeOf(context).toEqualTypeOf<unknown>();
        },
      },
    });

    createUser.mutate({ name: 'hello' });
    createUser.mutateAsync({ name: 'hello' }).then((user) => {
      expectTypeOf(user).toEqualTypeOf<{ userId: string; name: string }>();
    });

    // @ts-expect-error
    createUser.mutate({ name: 666 });
    // @ts-expect-error
    createUser.mutate({});

    const healthMutation = useAPIMutation('health');
    healthMutation.mutate(undefined);
    healthMutation.mutateAsync(undefined).then((res) => {
      expectTypeOf(res).toEqualTypeOf<void>();
    });
  });
});
