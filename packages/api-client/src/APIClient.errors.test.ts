import { describe, expect, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { APIClient } from './APIClient';
import { defineAPI } from './endpoint';
import {
  APIClientRequestParsingError,
  APIClientResponseParsingError,
} from './errors';

const apiSpec = defineAPI<{
  path: string;
  method: 'GET' | 'POST';
}>();

const testDefinitions = {
  validEndpoint: apiSpec.defineEndpoint({
    request: z.object({
      name: z.string().min(3),
      email: z.string().email(),
      age: z.number().int().min(0).max(120),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
      createdAt: z.string().datetime(),
    }),
    metadata: {
      path: '/users',
      method: 'POST',
    },
  }),

  noRequestEndpoint: apiSpec.defineEndpoint({
    request: null,
    response: z.object({
      status: z.literal('ok'),
      timestamp: z.number(),
    }),
    metadata: {
      path: '/health',
      method: 'GET',
    },
  }),

  complexValidationEndpoint: apiSpec.defineEndpoint({
    request: z.object({
      profile: z.object({
        personalInfo: z.object({
          firstName: z.string().min(1),
          lastName: z.string().min(1),
        }),
        preferences: z.array(z.enum(['email', 'sms', 'push'])),
      }),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    response: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('success'),
        profileId: z.string().uuid(),
      }),
      z.object({
        type: z.literal('error'),
        message: z.string(),
        code: z.number(),
      }),
    ]),
    metadata: {
      path: '/profiles',
      method: 'POST',
    },
  }),
};

describe('APIClient Error Handling', () => {
  describe('Request Validation Errors', () => {
    it('should throw detailed validation errors for invalid request data', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          id: 1,
          name: 'Test',
          email: 'test@example.com',
          createdAt: '2023-01-01T00:00:00Z',
        }),
      });

      // Test missing required fields
      try {
        await client.request('validEndpoint', {
          request: {} as any,
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientRequestParsingError);
        expect((error as APIClientRequestParsingError).endpoint).toBe(
          'validEndpoint',
        );
        const zodError = (error as APIClientRequestParsingError)
          .previousError as z.ZodError;
        expect(zodError.issues).toHaveLength(3); // name, email, age missing
        expect(zodError.issues.map((issue) => issue.path)).toEqual(
          expect.arrayContaining([['name'], ['email'], ['age']]),
        );
      }

      // Test invalid field types
      try {
        await client.request('validEndpoint', {
          request: {
            name: 123 as any, // Should be string
            email: 'invalid-email',
            age: 'twenty' as any, // Should be number
          },
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientRequestParsingError);
        const zodError = (error as APIClientRequestParsingError)
          .previousError as z.ZodError;
        expect(zodError.issues.length).toBeGreaterThan(0);
      }

      // Test constraint violations
      try {
        await client.request('validEndpoint', {
          request: {
            name: 'ab', // Too short (min 3)
            email: 'valid@email.com',
            age: 150, // Too old (max 120)
          },
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientRequestParsingError);
        const zodError = (error as APIClientRequestParsingError)
          .previousError as z.ZodError;
        expect(
          zodError.issues.some((issue) => issue.path.includes('name')),
        ).toBe(true);
        expect(
          zodError.issues.some((issue) => issue.path.includes('age')),
        ).toBe(true);
      }
    });

    it('should handle complex nested validation errors', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          type: 'success',
          profileId: '123e4567-e89b-12d3-a456-426614174000',
        }),
      });

      try {
        await client.request('complexValidationEndpoint', {
          request: {
            profile: {
              personalInfo: {
                firstName: '', // Invalid: too short
                lastName: 'Doe',
              },
              preferences: ['email', 'invalid'] as any, // Invalid enum value
            },
            metadata: {
              key1: 'value1',
            },
          },
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientRequestParsingError);
        const zodError = (error as APIClientRequestParsingError)
          .previousError as z.ZodError;

        // Should have errors for firstName and preferences
        expect(
          zodError.issues.some((issue) => issue.path.includes('firstName')),
        ).toBe(true);
        expect(
          zodError.issues.some((issue) => issue.path.includes('preferences')),
        ).toBe(true);
      }
    });

    it('should not validate request for endpoints with null request schema', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({ status: 'ok', timestamp: Date.now() }),
      });

      // Should work fine without request data
      const result = await client.request('noRequestEndpoint');
      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Resolver Errors', () => {
    it('should handle resolver throwing errors', async () => {
      const resolverError = new Error('Network connection failed');
      const client = new APIClient(testDefinitions, {
        resolver: async () => {
          throw resolverError;
        },
      });

      const failedMessages: any[] = [];
      client.$failed.subscribe((message) => {
        failedMessages.push(message);
      });

      try {
        await client.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
        expect.fail('Should have thrown resolver error');
      } catch (error) {
        expect(error).toBe(resolverError);
        expect(failedMessages).toHaveLength(1);
        expect(failedMessages[0]).toEqual({
          endpoint: 'validEndpoint',
          request: { name: 'Test', email: 'test@example.com', age: 25 },
          error: resolverError,
        });
      }
    });

    it('should handle resolver returning rejected promise', async () => {
      const rejectionReason = 'Request timeout';
      const client = new APIClient(testDefinitions, {
        resolver: async () => Promise.reject(new Error(rejectionReason)),
      });

      try {
        await client.request('noRequestEndpoint');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toBe(rejectionReason);
      }
    });

    it('should handle resolver with AbortController cancellation', async () => {
      const controller = new AbortController();
      const client = new APIClient(testDefinitions, {
        resolver: async ({ abortSignal }) => {
          return new Promise((_, reject) => {
            if (abortSignal) {
              abortSignal.addEventListener('abort', () => {
                reject(new Error('Request was aborted'));
              });
            }
          });
        },
      });

      const requestPromise = client.request('noRequestEndpoint', {
        abort: controller.signal,
      });

      // Abort the request
      controller.abort();

      try {
        await requestPromise;
        expect.fail('Should have thrown abort error');
      } catch (error) {
        expect((error as Error).message).toBe('Request was aborted');
      }
    });
  });

  describe('Response Validation Errors', () => {
    it('should throw validation errors for invalid response data', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          // Missing required fields: id, name, email, createdAt
        }),
      });

      try {
        await client.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
        expect.fail('Should have thrown response validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientResponseParsingError);
        expect((error as APIClientResponseParsingError).endpoint).toBe(
          'validEndpoint',
        );
        const zodError = (error as APIClientResponseParsingError)
          .previousError as z.ZodError;
        expect(zodError.issues).toHaveLength(4); // All required fields missing
      }
    });

    it('should validate response types correctly', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          id: 'not-a-number', // Should be number
          name: 123, // Should be string
          email: 'test@example.com',
          createdAt: 'not-a-datetime', // Invalid datetime format
        }),
      });

      try {
        await client.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
        expect.fail('Should have thrown response validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientResponseParsingError);
        const zodError = (error as APIClientResponseParsingError)
          .previousError as z.ZodError;
        expect(zodError.issues.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should handle discriminated union response validation', async () => {
      // Test valid success response
      const successClient = new APIClient(testDefinitions, {
        resolver: async () => ({
          type: 'success',
          profileId: '123e4567-e89b-12d3-a456-426614174000',
        }),
      });

      const successResult = await successClient.request(
        'complexValidationEndpoint',
        {
          request: {
            profile: {
              personalInfo: { firstName: 'John', lastName: 'Doe' },
              preferences: ['email', 'sms'],
            },
          },
        },
      );

      expectTypeOf(successResult).toEqualTypeOf<
        | {
            type: 'success';
            profileId: string;
          }
        | {
            type: 'error';
            message: string;
            code: number;
          }
      >();

      // Test valid error response
      const errorClient = new APIClient(testDefinitions, {
        resolver: async () => ({
          type: 'error',
          message: 'Profile creation failed',
          code: 400,
        }),
      });

      const errorResult = await errorClient.request(
        'complexValidationEndpoint',
        {
          request: {
            profile: {
              personalInfo: { firstName: 'John', lastName: 'Doe' },
              preferences: ['email'],
            },
          },
        },
      );

      expect(errorResult).toEqual({
        type: 'error',
        message: 'Profile creation failed',
        code: 400,
      });

      // Test invalid discriminated union
      const invalidClient = new APIClient(testDefinitions, {
        resolver: async () => ({
          type: 'unknown', // Invalid discriminator
          someField: 'value',
        }),
      });

      try {
        await invalidClient.request('complexValidationEndpoint', {
          request: {
            profile: {
              personalInfo: { firstName: 'John', lastName: 'Doe' },
              preferences: ['email'],
            },
          },
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientResponseParsingError);
      }
    });
  });

  describe('Custom Error Formatting', () => {
    it('should apply error formatter to request validation errors', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          id: 1,
          name: 'Test',
          email: 'test@example.com',
          createdAt: '2023-01-01T00:00:00Z',
        }),
      });

      client.setErrorFormatter((error, context) => {
        return new Error(`[${context.stage.toUpperCase()}] ${error.message}`);
      });

      try {
        await client.request('validEndpoint', {
          request: { name: '', email: 'invalid', age: -5 } as any,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/^\[REQUEST-VALIDATION\]/);
      }
    });

    it('should apply error formatter to resolver errors', async () => {
      const originalError = new Error('Network timeout');
      const client = new APIClient(testDefinitions, {
        resolver: async () => {
          throw originalError;
        },
      });

      client.setErrorFormatter((error, context) => {
        return new Error(`[${context.stage.toUpperCase()}] ${error.message}`);
      });

      const failedMessages: any[] = [];
      client.$failed.subscribe((message) => {
        failedMessages.push(message);
      });

      try {
        await client.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toBe('[RESOLVER] Network timeout');
        expect(failedMessages[0].error.message).toBe(
          '[RESOLVER] Network timeout',
        );
      }
    });

    it('should apply error formatter to response validation errors', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({ invalidResponse: 'data' }),
      });

      client.setErrorFormatter((error, context) => {
        return new Error(`[${context.stage.toUpperCase()}] ${error.message}`);
      });

      try {
        await client.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/^\[RESPONSE-VALIDATION\]/);
      }
    });

    it('should not emit failed messages for validation errors', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          id: 1,
          name: 'Test',
          email: 'test@example.com',
          createdAt: '2023-01-01T00:00:00Z',
        }),
      });

      const failedMessages: any[] = [];
      client.$failed.subscribe((message) => {
        failedMessages.push(message);
      });

      try {
        // Request validation error
        await client.request('validEndpoint', {
          request: {} as any,
        });
      } catch {}

      try {
        // Response validation error (change resolver to return invalid data)
        const invalidClient = new APIClient(testDefinitions, {
          resolver: async () => ({}),
        });
        invalidClient.$failed.subscribe((message) => {
          failedMessages.push(message);
        });

        await invalidClient.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
      } catch {}

      // Only resolver errors should emit failed messages
      expect(failedMessages).toHaveLength(0);
    });

    it('should preserve original error without formatter', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({
          id: 1,
          name: 'Test',
          email: 'test@example.com',
          createdAt: '2023-01-01T00:00:00Z',
        }),
      });

      try {
        await client.request('validEndpoint', {
          request: { name: '', email: 'invalid', age: -5 } as any,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientRequestParsingError);
        const parsingError = error as APIClientRequestParsingError;
        expect(parsingError.previousError).toBeInstanceOf(z.ZodError);
        expect(parsingError.endpoint).toBe('validEndpoint');
        // The wrapper error message should NOT have the formatter's stage prefix
        expect(parsingError.message).not.toMatch(
          /^\[REQUEST-VALIDATION\]|^\[RESOLVER\]|^\[RESPONSE-VALIDATION\]/,
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle endpoint not found in definitions', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => ({}),
      });

      try {
        await (client as any).request('nonExistentEndpoint');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(
          /Endpoint nonExistentEndpoint not found/,
        );
      }
    });

    it('should handle null/undefined resolver response', async () => {
      const client = new APIClient(testDefinitions, {
        resolver: async () => null,
      });

      try {
        await client.request('validEndpoint', {
          request: { name: 'Test', email: 'test@example.com', age: 25 },
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APIClientResponseParsingError);
      }
    });

    it('should handle promise rejection in resolver', async () => {
      const rejectionValue = { custom: 'rejection', code: 500 };
      const client = new APIClient(testDefinitions, {
        resolver: async () => Promise.reject(rejectionValue),
      });

      try {
        await client.request('noRequestEndpoint');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBe(rejectionValue);
      }
    });
  });
});
