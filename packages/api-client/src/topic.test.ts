import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import z from 'zod';
import { APIClient } from './APIClient';
import { defineAPI } from './endpoint';
import {
  APIClientRequestParsingError,
  APIClientResponseParsingError,
} from './errors';
import { type ErrorMessage, makeTopic, type SuccessMessage } from './topic';

describe('topics', () => {
  describe('makeTopic Function', () => {
    it('should create a topic with correct interface', () => {
      interface TestMessage {
        id: string;
        data: number;
        metadata?: Record<string, unknown>;
      }

      const topic = makeTopic<TestMessage>();

      expectTypeOf(topic).toEqualTypeOf<{
        publish: (message: TestMessage) => void;
        publishAsync: (message: TestMessage) => Promise<void>;
        subscribe: (listener: (message: TestMessage) => unknown) => () => void;
      }>();

      expectTypeOf(topic.publish).toEqualTypeOf<
        (message: TestMessage) => void
      >();
      expectTypeOf(topic.publishAsync).toEqualTypeOf<
        (message: TestMessage) => Promise<void>
      >();
      expectTypeOf(topic.subscribe).toEqualTypeOf<
        (listener: (message: TestMessage) => unknown) => () => void
      >();
    });

    it('should handle subscription and unsubscription', () => {
      const topic = makeTopic<{ value: number }>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      // Subscribe listeners
      const unsubscribe1 = topic.subscribe(listener1);
      const unsubscribe2 = topic.subscribe(listener2);

      // Publish a message
      topic.publish({ value: 42 });

      expect(listener1).toHaveBeenCalledWith({ value: 42 });
      expect(listener2).toHaveBeenCalledWith({ value: 42 });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      // Unsubscribe first listener
      unsubscribe1();

      // Publish another message
      topic.publish({ value: 84 });

      expect(listener1).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(listener2).toHaveBeenCalledWith({ value: 84 });
      expect(listener2).toHaveBeenCalledTimes(2);

      // Unsubscribe second listener
      unsubscribe2();

      // Publish third message
      topic.publish({ value: 126 });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple subscriptions to the same listener', () => {
      const topic = makeTopic<{ count: number }>();
      const listener = vi.fn();

      // Subscribe the same listener multiple times (Set will deduplicate)
      const unsubscribe1 = topic.subscribe(listener);
      const unsubscribe2 = topic.subscribe(listener);

      topic.publish({ count: 1 });

      // Should be called once (Set deduplicates the same listener)
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe first instance - since it's the same listener, it gets removed from Set
      unsubscribe1();

      topic.publish({ count: 2 });

      // Should NOT be called again (listener already removed from Set)
      expect(listener).toHaveBeenCalledTimes(1);

      // Try to unsubscribe the second instance (no-op since listener already removed)
      unsubscribe2();

      topic.publish({ count: 3 });

      // Should still not be called
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle publishAsync correctly', async () => {
      const topic = makeTopic<{ async: boolean }>();
      const results: string[] = [];

      const asyncListener1 = vi.fn(async (_message: { async: boolean }) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push('listener1');
        return 'result1';
      });

      const asyncListener2 = vi.fn(async (_message: { async: boolean }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        results.push('listener2');
        return 'result2';
      });

      const syncListener = vi.fn((_message: { async: boolean }) => {
        results.push('syncListener');
        return 'syncResult';
      });

      topic.subscribe(asyncListener1);
      topic.subscribe(asyncListener2);
      topic.subscribe(syncListener);

      await topic.publishAsync({ async: true });

      expect(asyncListener1).toHaveBeenCalledWith({ async: true });
      expect(asyncListener2).toHaveBeenCalledWith({ async: true });
      expect(syncListener).toHaveBeenCalledWith({ async: true });

      // All listeners should have completed
      expect(results).toContain('listener1');
      expect(results).toContain('listener2');
      expect(results).toContain('syncListener');
    });

    it('should handle errors in async listeners', async () => {
      const topic = makeTopic<{ test: string }>();
      const successfulListener = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'success';
      });

      const failingListener = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('Listener error');
      });

      topic.subscribe(successfulListener);
      topic.subscribe(failingListener);

      // publishAsync should not throw even if a listener throws
      await expect(
        topic.publishAsync({ test: 'error-handling' }),
      ).rejects.toThrow('Listener error');

      expect(successfulListener).toHaveBeenCalled();
      expect(failingListener).toHaveBeenCalled();
    });

    it('should handle synchronous publish with async listeners', () => {
      const topic = makeTopic<{ sync: boolean }>();
      const asyncListener = vi.fn(async (_message: { sync: boolean }) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      });

      const syncListener = vi.fn((_message: { sync: boolean }) => {
        return 'sync-result';
      });

      topic.subscribe(asyncListener);
      topic.subscribe(syncListener);

      // Synchronous publish should not wait for async listeners
      topic.publish({ sync: true });

      expect(asyncListener).toHaveBeenCalledWith({ sync: true });
      expect(syncListener).toHaveBeenCalledWith({ sync: true });
    });
  });

  describe('APIClient Topic Integration', () => {
    const api = defineAPI<{ path: string; method: string }>();

    const definitions = {
      createUser: api.defineEndpoint({
        request: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        response: z.object({
          id: z.number(),
          name: z.string(),
          email: z.string(),
          createdAt: z.string(),
        }),
        metadata: { path: '/users', method: 'POST' },
      }),

      getUser: api.defineEndpoint({
        request: z.object({ id: z.number() }),
        response: z.object({
          id: z.number(),
          name: z.string(),
          email: z.string(),
        }),
        metadata: { path: '/users/:id', method: 'GET' },
      }),

      deleteUser: api.defineEndpoint({
        request: null,
        response: z.object({ deleted: z.boolean() }),
        metadata: { path: '/users/:id', method: 'DELETE' },
      }),
    };

    describe('Success Topic Type Safety', () => {
      it('should type success messages correctly', () => {
        const client = new APIClient(definitions, {
          resolver: async () => ({}),
        });

        type ExpectedSuccessMessage = SuccessMessage<typeof definitions>;

        expectTypeOf(client.$succeeded).toEqualTypeOf<{
          publish: (message: ExpectedSuccessMessage) => void;
          publishAsync: (message: ExpectedSuccessMessage) => Promise<void>;
          subscribe: (
            listener: (message: ExpectedSuccessMessage) => unknown,
          ) => () => void;
        }>();

        client.$succeeded.subscribe((message) => {
          expectTypeOf(message.endpoint).toEqualTypeOf<
            'createUser' | 'getUser' | 'deleteUser'
          >();

          if (message.endpoint === 'createUser') {
            expectTypeOf(message).toEqualTypeOf<{
              endpoint: 'createUser';
              request: { name: string; email: string };
              response: {
                id: number;
                name: string;
                email: string;
                createdAt: string;
              };
            }>();

            expectTypeOf(message.request).toEqualTypeOf<{
              name: string;
              email: string;
            }>();
            expectTypeOf(message.response).toEqualTypeOf<{
              id: number;
              name: string;
              email: string;
              createdAt: string;
            }>();
          } else if (message.endpoint === 'getUser') {
            expectTypeOf(message).toEqualTypeOf<{
              endpoint: 'getUser';
              request: { id: number };
              response: { id: number; name: string; email: string };
            }>();

            expectTypeOf(message.request).toEqualTypeOf<{ id: number }>();
            expectTypeOf(message.response).toEqualTypeOf<{
              id: number;
              name: string;
              email: string;
            }>();
          } else if (message.endpoint === 'deleteUser') {
            expectTypeOf(message).toEqualTypeOf<{
              endpoint: 'deleteUser';
              request: never;
              response: { deleted: boolean };
            }>();

            expectTypeOf(message.request).toEqualTypeOf<never>();
            expectTypeOf(message.response).toEqualTypeOf<{
              deleted: boolean;
            }>();
          } else {
            expectTypeOf(message).toBeNever();
          }
        });
      });
    });

    describe('Error Topic Type Safety', () => {
      it('should type error messages correctly', () => {
        const client = new APIClient(definitions, {
          resolver: async () => {
            throw new Error('Test error');
          },
        });

        type ExpectedErrorMessage = ErrorMessage<typeof definitions>;

        expectTypeOf(client.$failed).toEqualTypeOf<{
          publish: (message: ExpectedErrorMessage) => void;
          publishAsync: (message: ExpectedErrorMessage) => Promise<void>;
          subscribe: (
            listener: (message: ExpectedErrorMessage) => unknown,
          ) => () => void;
        }>();

        client.$failed.subscribe((message) => {
          expectTypeOf(message.endpoint).toEqualTypeOf<
            'createUser' | 'getUser' | 'deleteUser'
          >();
          expectTypeOf(message.error).toEqualTypeOf<Error>();

          if (message.endpoint === 'createUser') {
            expectTypeOf(message).toEqualTypeOf<{
              endpoint: 'createUser';
              request: { name: string; email: string };
              error: Error;
            }>();

            expectTypeOf(message.request).toEqualTypeOf<{
              name: string;
              email: string;
            }>();
          } else if (message.endpoint === 'getUser') {
            expectTypeOf(message).toEqualTypeOf<{
              endpoint: 'getUser';
              request: { id: number };
              error: Error;
            }>();

            expectTypeOf(message.request).toEqualTypeOf<{ id: number }>();
          } else if (message.endpoint === 'deleteUser') {
            expectTypeOf(message).toEqualTypeOf<{
              endpoint: 'deleteUser';
              request: never;
              error: Error;
            }>();

            expectTypeOf(message.request).toEqualTypeOf<never>();
          } else {
            expectTypeOf(message).toBeNever();
          }
        });
      });
    });

    describe('Topic Event Flow', () => {
      it('should emit success events for successful requests', async () => {
        const successMessages: any[] = [];
        const failedMessages: any[] = [];

        const client = new APIClient(definitions, {
          resolver: async ({ endpoint, request }) => {
            if (endpoint === 'createUser') {
              return {
                id: 123,
                name: (request as any).name,
                email: (request as any).email,
                createdAt: '2023-01-01T00:00:00Z',
              };
            }
            if (endpoint === 'getUser') {
              return {
                id: (request as any).id,
                name: 'John Doe',
                email: 'john@example.com',
              };
            }
            if (endpoint === 'deleteUser') {
              return { deleted: true };
            }
            return {};
          },
        });

        client.$succeeded.subscribe((message) => {
          successMessages.push(message);
        });

        client.$failed.subscribe((message) => {
          failedMessages.push(message);
        });

        // Test createUser success
        await client.request('createUser', {
          request: { name: 'John', email: 'john@example.com' },
        });

        // Test getUser success
        await client.request('getUser', {
          request: { id: 123 },
        });

        // Test deleteUser success
        await client.request('deleteUser');

        expect(successMessages).toHaveLength(3);
        expect(failedMessages).toHaveLength(0);

        expect(successMessages[0]).toEqual({
          endpoint: 'createUser',
          request: { name: 'John', email: 'john@example.com' },
          response: {
            id: 123,
            name: 'John',
            email: 'john@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          },
        });

        expect(successMessages[1]).toEqual({
          endpoint: 'getUser',
          request: { id: 123 },
          response: {
            id: 123,
            name: 'John Doe',
            email: 'john@example.com',
          },
        });

        expect(successMessages[2]).toEqual({
          endpoint: 'deleteUser',
          request: undefined,
          response: { deleted: true },
        });
      });

      it('should emit error events for failed requests', async () => {
        const successMessages: any[] = [];
        const failedMessages: any[] = [];
        const testError = new Error('Server error');

        const client = new APIClient(definitions, {
          resolver: async ({ endpoint }) => {
            if (endpoint === 'createUser') {
              throw testError;
            }
            return { id: 1, name: 'Test', email: 'test@example.com' };
          },
        });

        client.$succeeded.subscribe((message) => {
          successMessages.push(message);
        });

        client.$failed.subscribe((message) => {
          failedMessages.push(message);
        });

        // Test failed createUser
        try {
          await client.request('createUser', {
            request: { name: 'John', email: 'john@example.com' },
          });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBe(testError);
        }

        // Test successful getUser
        await client.request('getUser', {
          request: { id: 123 },
        });

        expect(successMessages).toHaveLength(1);
        expect(failedMessages).toHaveLength(1);

        expect(failedMessages[0]).toEqual({
          endpoint: 'createUser',
          request: { name: 'John', email: 'john@example.com' },
          error: testError,
        });

        expect(successMessages[0]).toEqual({
          endpoint: 'getUser',
          request: { id: 123 },
          response: { id: 1, name: 'Test', email: 'test@example.com' },
        });
      });

      it('should not emit events for validation errors', async () => {
        const successMessages: any[] = [];
        const failedMessages: any[] = [];

        const client = new APIClient(definitions, {
          resolver: async () => ({
            id: 123,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          }),
        });

        client.$succeeded.subscribe((message) => {
          successMessages.push(message);
        });

        client.$failed.subscribe((message) => {
          failedMessages.push(message);
        });

        // Test request validation error
        try {
          await client.request('createUser', {
            request: { name: '', email: 'invalid-email' } as any,
          });
          expect.fail('Should have thrown validation error');
        } catch (error) {
          expect(error).toBeInstanceOf(APIClientRequestParsingError);
        }

        // Test response validation error
        const invalidResponseClient = new APIClient(definitions, {
          resolver: async () => ({ invalid: 'response' }),
        });

        invalidResponseClient.$succeeded.subscribe((message) => {
          successMessages.push(message);
        });

        invalidResponseClient.$failed.subscribe((message) => {
          failedMessages.push(message);
        });

        try {
          await invalidResponseClient.request('createUser', {
            request: { name: 'John', email: 'john@example.com' },
          });
          expect.fail('Should have thrown validation error');
        } catch (error) {
          expect(error).toBeInstanceOf(APIClientResponseParsingError);
        }

        expect(successMessages).toHaveLength(0);
        expect(failedMessages).toHaveLength(0);
      });

      it('should handle multiple subscribers for the same event', async () => {
        const subscriber1Messages: any[] = [];
        const subscriber2Messages: any[] = [];

        const client = new APIClient(definitions, {
          resolver: async () => ({
            id: 123,
            name: 'Test',
            email: 'test@example.com',
            createdAt: '2023-01-01T00:00:00Z',
          }),
        });

        const unsubscribe1 = client.$succeeded.subscribe((message) => {
          subscriber1Messages.push({ subscriber: 1, ...message });
        });

        const unsubscribe2 = client.$succeeded.subscribe((message) => {
          subscriber2Messages.push({ subscriber: 2, ...message });
        });

        await client.request('createUser', {
          request: { name: 'John', email: 'john@example.com' },
        });

        expect(subscriber1Messages).toHaveLength(1);
        expect(subscriber2Messages).toHaveLength(1);

        expect(subscriber1Messages[0].subscriber).toBe(1);
        expect(subscriber2Messages[0].subscriber).toBe(2);

        // Unsubscribe first subscriber
        unsubscribe1();

        await client.request('createUser', {
          request: { name: 'Jane', email: 'jane@example.com' },
        });

        expect(subscriber1Messages).toHaveLength(1); // No new messages
        expect(subscriber2Messages).toHaveLength(2); // One new message

        unsubscribe2();

        await client.request('createUser', {
          request: { name: 'Bob', email: 'bob@example.com' },
        });

        expect(subscriber1Messages).toHaveLength(1);
        expect(subscriber2Messages).toHaveLength(2);
      });

      it('should work with async subscribers', async () => {
        const asyncResults: string[] = [];

        const client = new APIClient(definitions, {
          resolver: async () => ({ deleted: true }),
        });

        client.$succeeded.subscribe(async (message) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          asyncResults.push(`async-${message.endpoint}`);
        });

        // Make the request
        await client.request('deleteUser');

        // Give async subscribers time to complete
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(asyncResults).toContain('async-deleteUser');
      });
    });

    describe('Topic Error Handling with Error Formatter', () => {
      it('should emit formatted errors in failed messages', async () => {
        const failedMessages: any[] = [];
        const originalError = new Error('Original resolver error');

        const client = new APIClient(definitions, {
          resolver: async () => {
            throw originalError;
          },
        });

        client.setErrorFormatter((error, context) => {
          return new Error(`[${context.stage}] ${error.message}`);
        });

        client.$failed.subscribe((message) => {
          failedMessages.push(message);
        });

        try {
          await client.request('getUser', {
            request: { id: 123 },
          });
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as Error).message).toBe(
            '[resolver] Original resolver error',
          );
        }

        expect(failedMessages).toHaveLength(1);
        expect(failedMessages[0].error.message).toBe(
          '[resolver] Original resolver error',
        );
        expect(failedMessages[0].endpoint).toBe('getUser');
        expect(failedMessages[0].request).toEqual({ id: 123 });
      });
    });
  });
});
