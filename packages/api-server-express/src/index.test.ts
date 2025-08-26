import { defineAPI } from '@unruly-software/api-client';
import { defineRouter } from '@unruly-software/api-server';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { type ExpressAPIMetadata, mountExpressApp } from '.';

const api = defineAPI<ExpressAPIMetadata>();

const definitions = {
  login: api.defineEndpoint({
    metadata: {
      method: 'GET',
      path: '/users',
    },
    request: null,
    response: null,
  }),
};

const router = defineRouter({ definitions });

const endpoints = {
  login: router.endpoint('login').handle(async () => {}),
};

const implemented = router.implement({ endpoints });

describe(mountExpressApp.name, () => {
  it('should make the expected calls for a mounted API endpoint', async () => {
    vi.spyOn(implemented, 'dispatch');
    const expressAppMock = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mountExpressApp({
      app: expressAppMock as any as Express,
      makeContext: async () => ({}),
      router: implemented,
      handleError: vi.fn(),
    });
    expect(expressAppMock.get).toHaveBeenCalledWith(
      '/users',
      expect.any(Function),
    );

    expect(implemented.dispatch).not.toHaveBeenCalled();

    const handler = expressAppMock.get.mock.calls[0][1];

    const req = { body: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      end: vi.fn(),
    };

    await handler(req, res);

    expect(implemented.dispatch).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('should call the error handler if the endpoint throws', async () => {
    const spy = vi.spyOn(implemented, 'dispatch');
    spy.mockRejectedValue(new Error('Test error'));
    const expressAppMock = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mountExpressApp({
      app: expressAppMock as any as Express,
      makeContext: async () => ({}),
      router: implemented,
    });
    expect(expressAppMock.get).toHaveBeenCalledWith(
      '/users',
      expect.any(Function),
    );

    const handler = expressAppMock.get.mock.calls[0][1];

    const req = { body: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      end: vi.fn(),
    };

    await handler(req, res);

    expect(implemented.dispatch).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Test error' });
  });
});
