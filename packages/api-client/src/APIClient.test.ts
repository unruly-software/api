import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { APIClient } from './APIClient';
import { defineAPI } from './endpoint';

const apiSpec = defineAPI<{
  path: string;
  type: 'mutation' | 'query';
}>();

const definition = {
  login: apiSpec.defineEndpoint({
    request: z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
    response: z.object({
      token: z.string(),
    }),
    metadata: {
      path: '/login',
      type: 'mutation',
    },
  }),

  logout: apiSpec.defineEndpoint({
    request: null,
    response: z.object({
      status: z.literal('ok'),
    }),
    metadata: {
      path: '/logout',
      type: 'mutation',
    },
  }),

  invalidResponseFromServer: apiSpec.defineEndpoint({
    request: null,
    response: z.object({
      status: z.literal('ok'),
    }),
    metadata: {
      path: '/invalid',
      type: 'mutation',
    },
  }),
};

const EMAIL = 'email@test.com';
const PASSWORD = 'password';

const client = new APIClient(definition, {
  resolver: async ({ definition, endpoint, request }) => {
    expectTypeOf<(typeof definition)['metadata']>().toEqualTypeOf<{
      path: string;
      type: 'mutation' | 'query';
    }>();
    expectTypeOf(endpoint).toEqualTypeOf<
      'login' | 'logout' | 'invalidResponseFromServer'
    >();

    if (endpoint === 'login') {
      if (request.password === PASSWORD && request.email === EMAIL) {
        expectTypeOf(request).toEqualTypeOf<{
          email: string;
          password: string;
        }>();
        return { token: 'abc' };
      }

      throw new Error('Invalid credentials returned from API');
    }

    if (endpoint === 'logout') {
      expectTypeOf(request).toEqualTypeOf<never>();
      return { status: 'ok' };
    }
  },
});

describe('Given the simple login/logout API Client and definition', async () => {
  it.skip('should pass basic type tests', () => {
    client.$failed.subscribe((message) => {
      if (message.endpoint === 'login') {
        expectTypeOf(message.request).toEqualTypeOf<{
          email: string;
          password: string;
        }>();
        expectTypeOf(message.error).toEqualTypeOf<Error>();
      } else if (message.endpoint === 'logout') {
        expectTypeOf(message.request).toEqualTypeOf<never>();
        expectTypeOf(message.error).toEqualTypeOf<Error>();
      } else if (message.endpoint === 'invalidResponseFromServer') {
        expectTypeOf(message.request).toEqualTypeOf<never>();
        expectTypeOf(message.error).toEqualTypeOf<Error>();
      } else {
        expectTypeOf(message).toBeNever();
      }
    });

    client.$succeeded.subscribe((message) => {
      if (message.endpoint === 'login') {
        expectTypeOf(message.request).toEqualTypeOf<{
          email: string;
          password: string;
        }>();
        expectTypeOf(message.response).toEqualTypeOf<{ token: string }>();
      } else if (message.endpoint === 'logout') {
        expectTypeOf(message.request).toEqualTypeOf<never>();
        expectTypeOf(message.response).toEqualTypeOf<{ status: 'ok' }>();
      } else if (message.endpoint === 'invalidResponseFromServer') {
        expectTypeOf(message.request).toEqualTypeOf<never>();
        expectTypeOf(message.response).toEqualTypeOf<{
          status: 'ok';
        }>();
      } else {
        expectTypeOf(message).toBeNever();
      }
    });

    client.request('logout');
    client.request('logout', { request: undefined });
    // @ts-expect-error Should prevent you from passing anything other than
    // literal undefined to a void request
    client.request('logout', { request: null });
    // @ts-expect-error Should prevent you from passing anything other than
    // literal undefined to a void request
    client.request('logout', { request: {} });

    // @ts-expect-error Should require request object
    client.request('login');
    // @ts-expect-error Should require request object
    client.request('login', { request: undefined });
    // @ts-expect-error Should require email and password
    client.request('login', { request: {} });
    // @ts-expect-error Should require email and password
    client.request('login', { request: { email: EMAIL } });

    client.request('login', { request: { email: '', password: '' } });
  });

  it('should make a successful login request', async () => {
    const result = await client.request('login', {
      request: { email: EMAIL, password: PASSWORD },
    });

    expectTypeOf(result).toEqualTypeOf<{ token: string }>();
    expect(result).toEqual({ token: 'abc' });
  });

  it('should make a successful logout request', async () => {
    const result = await client.request('logout');

    expectTypeOf(result).toEqualTypeOf<{ status: 'ok' }>();
    expect(result).toEqual({ status: 'ok' });
  });

  it('should make a failed login request', async () => {
    try {
      await client.request('login', {
        request: { email: EMAIL, password: 'structurally-valid-but-wrong' },
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatchInlineSnapshot(
        '"Invalid credentials returned from API"',
      );
    }
  });

  it('should make a failed login request with invalid input', async () => {
    try {
      await client.request('login', {
        request: { email: 'not-an-email', password: PASSWORD },
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as z.ZodError).issues).toMatchInlineSnapshot(`
        [
          {
            "code": "invalid_format",
            "format": "email",
            "message": "Invalid email address",
            "origin": "string",
            "path": [
              "email",
            ],
            "pattern": "/^(?!\\\\.)(?!.*\\\\.\\\\.)([A-Za-z0-9_'+\\\\-\\\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\\\-]*\\\\.)+[A-Za-z]{2,}$/",
          },
        ]
      `);
    }
  });

  it('should emit success messages', async () => {
    const successMessages: unknown[] = [];
    client.$succeeded.subscribe((message) => {
      successMessages.push(message);
    });

    // Intentionally fail a request to ensure only success messages are captured
    try {
      await client.request('login', {
        request: { email: EMAIL, password: 'structurally-valid-but-wrong' },
      });
    } catch {}

    const logoutResult = await client.request('logout');
    expect(logoutResult).toEqual({ status: 'ok' });

    const loginResult = await client.request('login', {
      request: { email: EMAIL, password: PASSWORD },
    });
    expect(loginResult).toEqual({ token: 'abc' });

    expect(successMessages).toHaveLength(2);
    expect(successMessages).toMatchInlineSnapshot(`
      [
        {
          "endpoint": "logout",
          "request": undefined,
          "response": {
            "status": "ok",
          },
        },
        {
          "endpoint": "login",
          "request": {
            "email": "email@test.com",
            "password": "password",
          },
          "response": {
            "token": "abc",
          },
        },
      ]
    `);
  });

  it('should emit failed messages', async () => {
    const failedMessages: unknown[] = [];
    client.$failed.subscribe((message) => {
      failedMessages.push(message);
    });

    try {
      await client.request('login', {
        request: { email: EMAIL, password: 'structurally-valid-but-wrong' },
      });
    } catch {}

    // Will not emit a failed message if the request is invalid
    try {
      await client.request('login', {
        request: { email: 'not-an-email', password: PASSWORD },
      });
    } catch {}

    // Will not emit a failed message if the request succeeds
    await client.request('logout');

    expect(failedMessages).toHaveLength(1);
    expect(failedMessages).toMatchInlineSnapshot(`
      [
        {
          "endpoint": "login",
          "error": [Error: Invalid credentials returned from API],
          "request": {
            "email": "email@test.com",
            "password": "structurally-valid-but-wrong",
          },
        },
      ]
    `);
  });

  it('should allow formatting the errors', async () => {
    client.setErrorFormatter(
      (err, context) => new Error(`${context.stage}-formatted: ${err.message}`),
    );

    // Listen to failure messages to ensure they are emitted as well as throwing
    const failedMessages: unknown[] = [];
    client.$failed.subscribe((message) => {
      failedMessages.push(message);
    });

    // Failing in request parsing
    try {
      await client.request('login', {
        request: { email: 'not-an-email', password: PASSWORD },
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatchInlineSnapshot(`
        "request-validation-formatted: [
          {
            \\"origin\\": \\"string\\",
            \\"code\\": \\"invalid_format\\",
            \\"format\\": \\"email\\",
            \\"pattern\\": \\"/^(?!\\\\\\\\.)(?!.*\\\\\\\\.\\\\\\\\.)([A-Za-z0-9_'+\\\\\\\\-\\\\\\\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\\\\\\\-]*\\\\\\\\.)+[A-Za-z]{2,}$/\\",
            \\"path\\": [
              \\"email\\"
            ],
            \\"message\\": \\"Invalid email address\\"
          }
        ]"
      `);
      expect(failedMessages).toHaveLength(0);
    }

    // Failing in resolver
    try {
      await client.request('login', {
        request: { email: EMAIL, password: 'structurally-valid-but-wrong' },
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatchInlineSnapshot(
        '"resolver-formatted: Invalid credentials returned from API"',
      );
      expect(failedMessages).toHaveLength(1);
      expect(failedMessages[0]).toMatchInlineSnapshot(`
        {
          "endpoint": "login",
          "error": [Error: resolver-formatted: Invalid credentials returned from API],
          "request": {
            "email": "email@test.com",
            "password": "structurally-valid-but-wrong",
          },
        }
      `);
    }

    failedMessages.shift();

    // Failing in response parsing
    try {
      await client.request('invalidResponseFromServer');
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatchInlineSnapshot(`
        "response-validation-formatted: [
          {
            \\"expected\\": \\"object\\",
            \\"code\\": \\"invalid_type\\",
            \\"path\\": [],
            \\"message\\": \\"Invalid input: expected object, received undefined\\"
          }
        ]"
      `);
      expect(failedMessages).toHaveLength(0);
    }
  });
});
