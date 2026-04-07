# @unruly-software/api-server

<div align="center">

<img src="https://github.com/unruly-software/api/blob/master/docs/logo.png" alt="Unruly Software API Framework" width="200" />

<br />
<br />

</div>

[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-server?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-server)
[![License](https://img.shields.io/github/license/unruly-software/api?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/unruly-software/api/blob/main/LICENSE)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@unruly-software/api-server?style=flat&colorA=18181B&colorB=28CF8D&label=bundle%20size)](https://bundlephobia.com/package/@unruly-software/api-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?style=flat&colorA=18181B&colorB=3178c6)](https://www.typescriptlang.org/)
[![Downloads](https://img.shields.io/npm/dm/@unruly-software/api-server?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-server)

A type-safe server router library that provides full TypeScript inference for
endpoint handlers using shared API definitions from
`@unruly-software/api-client`. Features automatic validation, integration with
any transport layer, and modular router composition.

## Quick Start

Install the packages:

```bash
npm install @unruly-software/api-server @unruly-software/api-client zod
# or
yarn add @unruly-software/api-server @unruly-software/api-client zod
```

Define your API using `@unruly-software/api-client`:

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

Create and implement the server router:

```typescript
import { defineRouter } from '@unruly-software/api-server';

// Define your context type (e.g., database connections, services)
type AppContext = {
  db: Database;
  userService: UserService;
};

const router = defineRouter<typeof apiDefinition, AppContext>({
  definitions: apiDefinition,
});

// Implement endpoint handlers with full type safety
const getUserHandler = router
  .endpoint('getUser')
  .handle(async ({ context, data }) => {
    // data is typed as { userId: number }
    // context is typed as AppContext
    const user = await context.userService.findById(data.userId);
    return user; // Return type is automatically validated
  });

const createUserHandler = router
  .endpoint('createUser')
  .handle(async ({ context, data }) => {
    // data is typed as { name: string; email: string }
    return await context.userService.create(data);
  });

// Create the implemented router
const implementedRouter = router.implement({
  endpoints: {
    getUser: getUserHandler,
    createUser: createUserHandler,
  },
});

// Use the router to dispatch requests
const result = await implementedRouter.dispatch({
  endpoint: 'getUser',
  data: { userId: 123 },
  context: { db, userService },
});
```

## Core Concepts

### Type Safety

The API server provides complete TypeScript type inference by sharing API definitions with the client:

- **Request validation**: Input data is automatically validated using your request schemas
- **Response validation**: Handler return values are validated against your response schemas
- **Full type inference**: TypeScript knows the exact shape of request data and expected responses
- **Shared definitions**: Use the same API definitions on both client and server for consistency

### Router Definition

Routers are defined using shared API endpoint definitions and a context type:

- **API definitions**: Import endpoint definitions created with `@unruly-software/api-client`
- **Context type**: Define the shape of your application context (database, services, etc.)
- **Endpoint handlers**: Implement type-safe handlers for each endpoint
- **Automatic validation**: Request and response data is automatically validated

### Context Management

The context system provides flexible dependency injection and middleware capabilities:

```typescript
const router = defineRouter<typeof apiDefinition, AppContext>({
  definitions: apiDefinition,
});

// Handle endpoint directly
const getUserHandler = router
  .endpoint('getUser')
  .handle(async ({ context, data }) => {
    // Handle authentication directly in the handler
    const user = await context.auth.getCurrentUser();
    console.log('Current user:', user);
    return await context.userService.findById(data.userId);
  });
```

### Router Composition

Combine multiple routers for modular API design:

```typescript
const userRouter = defineRouter({ definitions: userDefinitions }).implement({
  endpoints: { /* user endpoints */ }
});

const orderRouter = defineRouter({ definitions: orderDefinitions }).implement({
  endpoints: { /* order endpoints */ }
});

// Merge routers
const apiRouter = mergeImplementedRouters(userRouter, orderRouter);
```

## Examples

### Basic Router Setup

```typescript
import { defineAPI } from '@unruly-software/api-client';
import { defineRouter } from '@unruly-software/api-server';
import z from 'zod';

// Define API using api-client
const api = defineAPI<{ path: string; method: string }>();

const todoAPI = {
  getTodos: api.defineEndpoint({
    request: null, // No request body needed
    response: z.array(z.object({
      id: z.number(),
      title: z.string(),
      completed: z.boolean(),
    })),
    metadata: { path: '/todos', method: 'GET' },
  }),

  createTodo: api.defineEndpoint({
    request: z.object({
      title: z.string().min(1),
      completed: z.boolean().default(false),
    }),
    response: z.object({
      id: z.number(),
      title: z.string(),
      completed: z.boolean(),
    }),
    metadata: { path: '/todos', method: 'POST' },
  }),
};

// Define context
type TodoContext = {
  todoService: TodoService;
};

// Create router
const router = defineRouter<typeof todoAPI, TodoContext>({
  definitions: todoAPI,
});

// Implement handlers
const implementedRouter = router.implement({
  endpoints: {
    getTodos: router
      .endpoint('getTodos')
      .handle(async ({ context }) => {
        return await context.todoService.findAll();
      }),

    createTodo: router
      .endpoint('createTodo')
      .handle(async ({ context, data }) => {
        return await context.todoService.create(data);
      }),
  },
});
```

### Error Handling

```typescript
const router = defineRouter<typeof apiDefinition, AppContext>({
  definitions: apiDefinition,
});

const getUserWithErrorHandling = router
  .endpoint('getUser')
  .handle(async ({ context, data }) => {
    try {
      const user = await context.userService.findById(data.userId);

      if (!user) {
        // Return null as defined in response schema
        return null;
      }

      return user;
    } catch (error) {
      context.logger.error('Failed to get user', { userId: data.userId, error });
      throw new Error(`User lookup failed: ${error.message}`);
    }
  });

// Error handling in dispatch
try {
  const result = await implementedRouter.dispatch({
    endpoint: 'getUser',
    data: { userId: 999 },
    context: appContext,
  });
} catch (error) {
  // Handle validation errors, handler errors, etc.
  console.error('Request failed:', error.message);
}
```

### Integration with Express

```typescript
import express from 'express';

const app = express();
app.use(express.json());

// Generic handler for all API endpoints
app.all('/api/:endpoint', async (req, res) => {
  try {
    const result = await implementedRouter.dispatch({
      endpoint: req.params.endpoint,
      data: req.body,
      context: {
        db,
        userService,
        logger: req.logger,
      },
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## API Reference

### `defineRouter<API, CTX>(config)`

Creates a new router for the given API definitions and context type.

**Type Parameters:**
- `API` - The API endpoint definitions type
- `CTX` - The application context type

**Parameters:**
- `config.definitions` - Object containing endpoint definitions from `@unruly-software/api-client`

**Returns:** `APIRouter<API, CTX>`

**Example:**
```typescript
const router = defineRouter<typeof apiDefinition, AppContext>({
  definitions: apiDefinition,
});
```

### `APIRouter<API, CTX>`

The main router interface for building endpoint handlers.

#### Methods

##### `endpoint<K>(endpoint)`

Select an endpoint to implement.

**Type Parameters:**
- `K` - Endpoint key from API definitions

**Parameters:**
- `endpoint` - The endpoint key to implement

**Returns:** `APIRoute<API[K], CTX, CTX>`

##### `implement(config)`

Create an implemented router with all endpoint handlers.

**Parameters:**
- `config.endpoints` - Object mapping endpoint keys to their implementations

**Returns:** `ImplementedAPIRouter<API, CTX>`

### `APIRoute<DEF, CTX>`

Interface for configuring a single endpoint route.

#### Methods

##### `handle(handler)`

Implement the endpoint handler function.

**Parameters:**
- `handler` - Function that processes the request
  - `handler.data` - Validated request data
  - `handler.definition` - Endpoint definition
  - `handler.context` - Application context to inject dependencies

**Returns:** `FinalizedAPIRoute<DEF, CTX>`


### `ImplementedAPIRouter<API, CTX>`

A fully implemented router ready to handle requests.

#### Properties

##### `definitions`

The API endpoint definitions used by this router.

**Type:** `API`

##### `endpoints`

Map of implemented endpoint handlers.

**Type:** `{ [K in keyof API]: FinalizedAPIRoute<API[K], any, CTX> }`

#### Methods

##### `dispatch<K>(args)`

Execute a request against an endpoint.

**Type Parameters:**
- `K` - Endpoint key from API definitions

**Parameters:**
- `args.endpoint` - Endpoint key to call
- `args.data` - Request data (validated against endpoint schema)
- `args.context` - Application context

**Returns:** `Promise<SchemaServerResponse<API[K]['response']>>`

### Type Definitions

#### `SchemaServerResponse<S>`

The return type for endpoint handlers based on the response schema.

```typescript
type SchemaServerResponse<S extends SchemaValue> =
  SchemaInferInput<S> extends never ? void : SchemaInferInput<S>
```

#### `APIEndpointDefinitions`

Base type for API endpoint definition objects.

```typescript
type APIEndpointDefinitions = Record<string, AnyEndpointDefinition>
```

#### `FinalizedAPIRoute<DEF, CTX>`

A finalized route handler with both regular and direct invocation methods.

**Properties:**
- `handle(input)` - Handle request with middleware chain
- `handleDirect(input)` - Skip middleware and invoke handler directly

## License

MIT
