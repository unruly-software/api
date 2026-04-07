# @unruly-software/api-client

<div align="center">

<img src="https://github.com/unruly-software/api/blob/master/docs/logo.png" alt="Unruly Software API Framework" width="200" />

<br />
<br />

</div>

[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-client?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-client)
[![License](https://img.shields.io/github/license/unruly-software/api?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/unruly-software/api/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@unruly-software/api-client?style=flat&colorA=18181B&colorB=28CF8D&label=bundle%20size)](https://bundlephobia.com/package/@unruly-software/api-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?style=flat&colorA=18181B&colorB=3178c6)](https://www.typescriptlang.org/)
[![Downloads](https://img.shields.io/npm/dm/@unruly-software/api-client?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-client)

A type-safe API client library that provides full TypeScript inference for
request and response data using Zod schemas. Features automatic validation,
flexible transport layers, and event-driven success/failure monitoring.

## Quick Start

Install the package:

```bash
npm install @unruly-software/api-client zod
# or
yarn add @unruly-software/api-client zod
```

Define your API:

```typescript
import { defineAPI } from '@unruly-software/api-client';
import z from 'zod';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

export const apiDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({
      userId: z.number(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    }),
    metadata: {
      method: 'GET',
      path: '/users/:userId',
    },
  }),

  createUser: api.defineEndpoint({
    request: z.object({
      name: z.string(),
      email: z.string().email(),
    }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    }),
    metadata: {
      method: 'POST',
      path: '/users',
    },
  }),
};
```

Create and use the client:

```typescript
import { APIClient } from '@unruly-software/api-client';

const client = new APIClient(apiDefinition, {
  resolver: async ({ definition, request }) => {
    const response = await fetch(`https://api.example.com${definition.metadata.path}`, {
      method: definition.metadata.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return response.json();
  },
});

// Type-safe API calls with full inference
const user = await client.request('getUser', {
  request: { userId: 123 }
});
// user is typed as { id: number; name: string; email: string }

const newUser = await client.request('createUser', {
  request: { name: 'John', email: 'john@example.com' }
});
// Full type safety - TypeScript will catch any type mismatches
```

## Core Concepts

### Type Safety

The API client provides complete TypeScript type inference from your Zod schemas:

- **Request validation**: Input data is parsed by your request schema before sending
- **Response validation**: Server responses are validated and parsed by your response schema
- **Full type inference**: TypeScript knows the exact shape of requests and responses
- **Compile-time safety**: Type errors are caught at build time, not runtime

### Endpoint Definitions

Endpoints are defined with three parts:

- **Request schema**: Zod schema defining the input data structure (or null if no request body is needed)
- **Response schema**: Zod schema defining the expected response structure (or null if no response body is expected)
- **Metadata**: Custom metadata object (paths, HTTP methods, etc.) that can be used by your resolver or the server to determine how to send or handle the request.

### Resolver Pattern

The resolver is your transport layer - it handles the actual network
communication/transport. You can implement it using any protocol (HTTP,
WebSocket, IPC, etc.) or even mock it for testing. The client will handle
validation and type inference, while the resolver focuses on sending requests
and receiving responses.:

```typescript
const client = new APIClient(apiDefinition, {
  resolver: async ({ definition, request, endpoint, abortSignal }) => {
    // definition: The endpoint definition with metadata
    // request: Validated request data
    // endpoint: The endpoint key (e.g., 'getUser')
    // abortSignal: Optional AbortSignal for request cancellation

    // Implement any transport: HTTP, WebSocket, IPC, etc.
    return await transport.send(definition, request);
  },
});
```

### Event System

Monitor API calls with built-in topics:

```typescript
// Listen for successful requests
client.$succeeded.subscribe(({ endpoint, request, response }) => {
  console.log(`${endpoint} succeeded:`, { request, response });
});

// Listen for failed requests
client.$failed.subscribe(({ endpoint, request, error }) => {
  console.log(`${endpoint} failed:`, { request, error });
});
```

## Examples

### Basic HTTP Client

```typescript
import { APIClient, defineAPI } from '@unruly-software/api-client';
import z from 'zod';

const api = defineAPI<{ path: string; method: string }>();

const userAPI = {
  login: api.defineEndpoint({
    request: z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
    response: z.object({
      token: z.string(),
      user: z.object({
        id: z.number(),
        email: z.string(),
      }),
    }),
    metadata: { path: '/auth/login', method: 'POST' },
  }),

  logout: api.defineEndpoint({
    request: null, // No request body needed
    response: z.object({
      status: z.literal('ok'),
    }),
    metadata: { path: '/auth/logout', method: 'POST' },
  }),
};

const client = new APIClient(userAPI, {
  resolver: async ({ definition, request, abortSignal }) => {
    const response = await fetch(`https://api.example.com${definition.metadata.path}`, {
      method: definition.metadata.method,
      headers: { 'Content-Type': 'application/json' },
      body: request ? JSON.stringify(request) : undefined,
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },
});

// Usage
const loginResult = await client.request('login', {
  request: { email: 'user@example.com', password: 'secret123' }
});

const logoutResult = await client.request('logout');
// No request parameter needed for endpoints with null request schema
```

### Error Handling and Validation

```typescript
// Set up error formatting
client.setErrorFormatter((error, context) => {
  if (context.stage === 'request-validation') {
    return new Error(`Invalid request: ${error.message}`);
  }
  if (context.stage === 'response-validation') {
    return new Error(`Invalid server response: ${error.message}`);
  }
  return new Error(`Network error: ${error.message}`);
});

try {
  await client.request('login', {
    request: { email: 'invalid-email', password: '123' } // Too short
  });
} catch (error) {
  // Error will be formatted with context about validation failure
}
```

### Request Cancellation

```typescript
const controller = new AbortController();

// Start a request
const userPromise = client.request('getUser', {
  request: { userId: 123 },
  abort: controller.signal,
});

// Cancel it if needed
setTimeout(() => controller.abort(), 5000);

try {
  const user = await userPromise;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

### Custom Transport Layer

```typescript
// WebSocket resolver example
const wsClient = new APIClient(apiDefinition, {
  resolver: async ({ definition, request, endpoint }) => {
    return new Promise((resolve, reject) => {
      const requestId = generateId();

      // Send request via WebSocket
      ws.send(JSON.stringify({
        id: requestId,
        endpoint,
        data: request,
      }));

      // Wait for response
      const handler = (event) => {
        const response = JSON.parse(event.data);
        if (response.id === requestId) {
          ws.removeEventListener('message', handler);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        }
      };

      ws.addEventListener('message', handler);
    });
  },
});
```

### Event Monitoring

```typescript
// Analytics tracking
client.$succeeded.subscribe(({ endpoint, request, response }) => {
  analytics.track('api_request_success', {
    endpoint,
    response_size: JSON.stringify(response).length,
  });
});

client.$failed.subscribe(({ endpoint, request, error }) => {
  analytics.track('api_request_failed', {
    endpoint,
    error: error.message,
  });
});

// Request logging
client.$succeeded.subscribe(({ endpoint, request, response }) => {
  console.log(`✓ ${endpoint}`, { request, response });
});

client.$failed.subscribe(({ endpoint, request, error }) => {
  console.error(`✗ ${endpoint}`, { request, error: error.message });
});
```

## API Reference

### `defineAPI<METADATA>()`

Creates a new API definition builder with typed metadata.

**Type Parameters:**
- `METADATA` - Shape of metadata object for each endpoint

**Returns:** Object with `defineEndpoint` method

**Example:**
```typescript
const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST';
  auth?: boolean;
}>();
```

### `APIClient<T>`

Main client class for making type-safe API requests.

#### Constructor

```typescript
new APIClient<T>(definitions: T, config: APIClientConfig<T>)
```

**Parameters:**
- `definitions` - Object containing endpoint definitions
- `config` - Configuration object with resolver function

#### Methods

##### `request<K>(endpoint, options?)`

Make a type-safe request to an endpoint.

**Type Parameters:**
- `K` - Endpoint key from definitions

**Parameters:**
- `endpoint` - Endpoint key
- `options` - Request options (required if endpoint expects request data)
  - `request` - Request data (typed based on endpoint schema)
  - `abort?` - AbortSignal for request cancellation

**Returns:** `Promise<ResponseType>` - Response typed based on endpoint schema

##### `setErrorFormatter(formatter)`

Set a custom error formatter for validation and resolver errors.

**Parameters:**
- `formatter` - Function that takes error and context, returns formatted Error

```typescript
client.setErrorFormatter((error, context) => {
  // context.stage is 'request-validation' | 'resolver' | 'response-validation'
  return new Error(`${context.stage}: ${error.message}`);
});
```

#### Properties

##### `$succeeded`

Topic that emits successful request messages.

**Type:** `Topic<SuccessMessage<T>>`

**Message format:**
```typescript
{
  endpoint: string;
  request: any;
  response: any;
}
```

##### `$failed`

Topic that emits failed request messages.

**Type:** `Topic<ErrorMessage<T>>`

**Message format:**
```typescript
{
  endpoint: string;
  request: any;
  error: Error;
}
```

### Type Definitions

#### `APIResolver<T>`

Function signature for the transport resolver.

```typescript
type APIResolver<T> = (params: {
  endpoint: keyof T;
  definition: T[keyof T];
  request: any;
  abortSignal?: AbortSignal;
}) => Promise<unknown>
```

#### `EndpointDefinition<REQUEST, RESPONSE, METADATA>`

Shape of an endpoint definition.

```typescript
type EndpointDefinition<
  REQUEST extends SchemaValue,
  RESPONSE extends SchemaValue,
  METADATA extends Record<string, unknown>
> = {
  request: REQUEST;
  response: RESPONSE;
  metadata: METADATA;
}
```

#### `RequestOptions<T>`

Options for making requests, conditional on whether request data is required.

#### `ErrorFormatter`

Function for customizing error messages.

```typescript
type ErrorFormatter = (
  error: Error,
  context: {
    stage: 'request-validation' | 'resolver' | 'response-validation';
  }
) => Error
```

### Topics

Topics provide an event-driven way to monitor API calls. Each topic supports:

- `subscribe(listener)` - Add a listener function, returns unsubscribe function
- `publish(message)` - Emit a message to all listeners
- `publishAsync(message)` - Emit a message and wait for all listeners to complete

## License

MIT
