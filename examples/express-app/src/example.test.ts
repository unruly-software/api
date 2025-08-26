import * as net from 'node:net';
import { describe, expect, it } from 'vitest';
import { startServer } from './api/express-app';
import { buildAPIClient } from './client/api-client';

function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

describe('example express app', async () => {
  it('should boot and respond', async () => {
    const port = await getPort();
    const server = await startServer(port);
    try {
      const client = buildAPIClient(`http://localhost:${port}`);
      const result = await client.request('getUser', {
        request: { userId: 1 },
      });

      expect(result).toBeNull();

      const created = await client.request('createUser', {
        request: { name: 'Alice', email: 'alice@test.com' },
      });

      expect(created).toEqual({
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
      });

      const fetched = await client.request('getUser', {
        request: { userId: 1 },
      });

      expect(fetched).toEqual({
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
      });

      await expect(
        client.request('getUser', {
          request: { userId: -1 },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: Invalid user ID]`);
    } finally {
      server.close();
    }
  });
});
