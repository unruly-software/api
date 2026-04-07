# Unruly Software API Framework

<div align="center">

<img src="https://github.com/unruly-software/api/blob/master/docs/logo.png" alt="Unruly Software API Framework" width="500" />

<br />
<br />

[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-client?style=flat&colorA=18181B&colorB=28CF8D&label=@unruly-software/api-client)](https://www.npmjs.com/package/@unruly-software/api-client)
[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-server?style=flat&colorA=18181B&colorB=28CF8D&label=@unruly-software/api-server)](https://www.npmjs.com/package/@unruly-software/api-server)
[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D&label=@unruly-software/api-query)](https://www.npmjs.com/package/@unruly-software/api-query)
[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-server-express?style=flat&colorA=18181B&colorB=28CF8D&label=@unruly-software/api-server-express)](https://www.npmjs.com/package/@unruly-software/api-server-express)

[![License](https://img.shields.io/github/license/unruly-software/api?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/unruly-software/api/blob/main/LICENSE)

</div>

---

A complete suite of TypeScript packages for building type-safe API clients and
servers. Define your endpoints once and enjoy end-to-end type safety, automatic
validation and parsing with zod, seamless React Query integration, and support
for any custom transport layer (HTTP, websocket, in-memory).

Define your API once with Zod schemas, then enjoy full type safety across
client and server boundaries with automatic validation, React Query
integration, and Express.js support.

## Features

- **Full Type Safety** - End-to-end TypeScript inference from Zod schemas
- **Automatic Validation** - Request and response validation on both client and server
- **Single Source of Truth** - Define APIs once, use everywhere
- **React Query Integration** - Built-in hooks with cache management
- **Multiple Transports** - HTTP, WebSocket, IPC, or custom transport layers
- **Developer Experience** - Comprehensive error handling and debugging
- **Infinitely Extensible** - Implement your own fetch, handle your own requests or even integrate with existing clients or servers

## Packages

This monorepo contains four core packages that work together:

### Core Packages

| Package | Description | NPM |
|---------|-------------|-----|
| **[@unruly-software/api-client](./packages/api-client)** | Type-safe API client with schema validation | [![NPM](https://img.shields.io/npm/v/@unruly-software/api-client?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-client) |
| **[@unruly-software/api-server](./packages/api-server)** | Server-side router with context management | [![NPM](https://img.shields.io/npm/v/@unruly-software/api-server?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-server) |
| **[@unruly-software/api-query](./packages/api-query)** | React Query hooks and cache management | [![NPM](https://img.shields.io/npm/v/@unruly-software/api-query?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-query) |
| **[@unruly-software/api-server-express](./packages/api-server-express)** (Experimental) | Express.js adapter and middleware | [![NPM](https://img.shields.io/npm/v/@unruly-software/api-server-express?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-server-express) |

## How It Compares

The @unruly-software API framework takes a unique approach to type-safe APIs
with a **"define once, use anywhere"** philosophy. Unlike alternatives that
lock you into specific protocols or require code generation, this framework
gives you maximum flexibility while maintaining full type safety.

In the same way that React Query supports anything that returns a `Promise<T>`.
@unruly-software/api-* packages leave the implementation and customization of
transport layers, request and error handling to you without locking you into a
specific protocol or framework. Whether you're building a REST API, a WebSocket
service, or even an in-memory API for testing, you can use the same API
definitions and enjoy end-to-end type safety with Zod validation.

### Key Advantages

🔧 **Transport Agnostic** - Use HTTP, WebSocket, IPC, or any custom transport layer with the same API definitions

🎯 **Define Once, Use Anywhere** - Single schema definitions work seamlessly across client, server, and any communication protocol

⚡ **Full Zod Power** - Complete access to all Zod features including transforms, custom data types, classes, and complex validation logic on both frontend and backend

🚀 **No Code Generation** - Zero build steps, no generated files, just pure TypeScript inference

🔌 **Existing API Integration** - Easily wrap and type existing REST APIs without modification

🌐 **Public API Ready** - Generate REST endpoints for external consumers while keeping internal type safety

| Feature | @unruly-software | tRPC | GraphQL | REST + OpenAPI | gRPC |
| ---------|------------------|------|---------|----------------|------|
| **Transport Flexibility** | ✅ Any (HTTP, WS, IPC, or none!) | ❌ HTTP only | ✅ Any (mostly HTTP) | ❌ HTTP only | ❌ HTTP/2 only |
| **Define Once, Use Anywhere** | ✅ Single definition | ❌ Needs server code access | ✅ Schema + resolvers | ✅ Schema + implementation | ✅ Proto + implementation |
| **Custom Type Support** | ✅ All features + transforms | ✅ Basic schemas | ❌ Custom scalars only | ❌ Limited validation | ✅ Protocol buffers |
| **Existing API Support** | ✅ Wrap any API | ❌ TypeScript only | ✅ Language agnostic | ✅ Language agnostic | ❌ gRPC services only |
| **Code Generation** | ✅ None required | ✅ None required | ❌ Required | ❌ Required | ❌ Required |
| **Existing API Integration** | ✅ Wrap any API | ❌ Full rewrite needed | ❌ Full rewrite needed | ✅ Document existing | ❌ Full rewrite needed |
| **Framework Coupling** | ✅ Framework agnostic | ✅ Framework agnostic | ✅ Framework agnostic | ✅ Framework agnostic | ✅ Framework agnostic |
| **Bundle Size** | ✅ Minimal | ✅ Small | ❌ Large ecosystem | ✅ Minimal | ✅ Small |
| **Learning Curve** | ✅ Low (if you know Zod) | ✅ Low | ❌ High | ✅ Low | ❌ High |
| **Frontend Schema Reuse** | ✅ Forms, validation, transforms | ❌ Server-only types | ❌ Requires separate validation | ❌ Requires separate validation | ❌ Backend-only protocols |

### vs tRPC

**Choose @unruly-software when:**
- You want transport flexibility (WebSocket, UDP, etc.)
- Building public APIs for external consumers and want to provide them with a client
- Working with existing REST APIs you can't rewrite
- Need advanced Zod features like transforms and custom types without redefining those types in each consumer
- Want to re-use your schemas to build forms

**Choose tRPC when:**
- Don't mind coupling your API definitions to your server codebase
- Building pure TypeScript monorepos with React/Next.js
- Don't need public API support
- Want the largest TypeScript RPC ecosystem
- Primarily using HTTP transport
- Don't need custom value objects or data transforms/validation logic in the client
- Prefer a more opinionated framework with built-in conventions

### vs GraphQL

**Choose @unruly-software when:**
- Want simpler setup without query complexity
- Don't need client-driven queries or complex data graphs
- Prefer TypeScript-first development
- Need type safety without learning GraphQL SDL
- Building REST-compatible APIs
- Want to avoid the GraphQL ecosystem overhead
- Want to avoid configuring complex build tools for GraphQL code generation

**Choose GraphQL when:**
- Building complex data graphs with relationships is your jam
- Need flexible client-driven queries to avoid overfetching
- Have multiple client platforms with different data needs
- Want a mature ecosystem with extensive tooling
- You like debugging N+1 queries in production

### vs REST + OpenAPI/Swagger

**Choose @unruly-software when:**
- Want end-to-end type safety without code generation
- Need shared validation logic between client and server
- Prefer defining schemas in TypeScript with Zod
- Want React Query integration out of the box

**Choose REST + OpenAPI when:**
- Building pure REST APIs for external consumption
- Need maximum compatibility with existing tooling
- Want language-agnostic API documentation
- Working in polyglot environments

### vs gRPC

**Choose @unruly-software when:**
- Need transport flexibility beyond HTTP/2
- Want TypeScript-first development without Protocol Buffers
- Need to integrate with existing REST APIs
- Prefer Zod validation over protobuf schemas
- Building web applications (better browser support)

**Choose gRPC when:**
- Need maximum performance for microservice communication
- Building polyglot systems with multiple languages
- Want built-in streaming capabilities
- Have complex service-to-service communication requirements
- Working in backend-only environments

## Use Cases

### Perfect For

- **Full-stack TypeScript applications** that need type safety across boundaries
- **Microservices** that communicate via different protocols (HTTP, message queues, etc.)
- **API wrappers** for existing services that need type safety
- **Multi-transport applications** (HTTP REST + WebSocket real-time + background jobs)
- **Teams migrating** from untyped APIs to type-safe alternatives
- **Libraries and SDKs** that need flexible transport layers


## Quick Start

### 1. Define Your API

First, define your API endpoints with Zod schemas:

```typescript
import { defineAPI } from '@unruly-software/api-client';
import z from 'zod';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

export const userAPI = {
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

### 2. Implement Your Server

Create a type-safe server with automatic validation:

```typescript
import { defineRouter } from '@unruly-software/api-server';
import { createExpressApp } from '@unruly-software/api-server-express';

// Define your application context
type AppContext = {
  db: Database;
  userService: UserService;
};

// Create the router
const router = defineRouter<typeof userAPI, AppContext>({
  definitions: userAPI,
});

// Implement endpoints with full type safety
const implementedRouter = router.implement({
  endpoints: {
    getUser: router
      .endpoint('getUser')
      .handle(async ({ context, data }) => {
        // data is typed as { userId: number }
        return await context.userService.findById(data.userId);
      }),

    createUser: router
      .endpoint('createUser')
      .handle(async ({ context, data }) => {
        // data is typed as { name: string; email: string }
        return await context.userService.create(data);
      }),
  },
});

// Or implement your own transport layer in a few lines of code!
const app = createExpressApp(implementedRouter, {
  context: { db, userService },
  basePath: '/api',
});

app.listen(3000);
```

### 3. Use in Your Frontend

Enjoy type-safe React hooks with automatic cache management:

```typescript
import { APIClient } from '@unruly-software/api-client';
import { mountAPIQueryClient } from '@unruly-software/api-query';
import { QueryClient } from '@tanstack/react-query';

// Create API client
const apiClient = new APIClient(userAPI, {
  resolver: async ({ definition, request }) => {
    const response = await fetch(`https://api.example.com${definition.metadata.path}`, {
      method: definition.metadata.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return response.json();
  },
});

// Mount React Query hooks
const { useAPIQuery, useAPIMutation } = mountAPIQueryClient(
  apiClient,
  new QueryClient(),
  {
    getUser: {
      queryKey: ({ request }) => ['user', request?.userId],
    },
    createUser: {
      invalidates: () => [['users']],
    },
  }
);

// Use in components with full type safety
function UserProfile({ userId }: { userId: number }) {
  const { data: user, isLoading } = useAPIQuery('getUser', {
    data: { userId }
  });

  const createUserMutation = useAPIMutation('createUser');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{user?.name}</h1>
      <p>{user?.email}</p>
    </div>
  );
}
```

## Examples

This repository includes several examples that demonstrate different use cases and integration patterns:

| Example | Description | Key Features |
|---------|-------------|--------------|
| **[JSONPlaceholder API Client](./examples/example-existing-api)** | Type-safe client for an existing REST API | • API definition with Zod schemas<br/>• HTTP resolver with fetch<br/>• Integration tests with live API<br/>• Event system for success/failure |
| **[React Query Integration](./examples/example-api-query)** | Modern React app with API client | • React Query hooks (`useAPIQuery`, `useAPIMutation`)<br/>• Automatic cache invalidation<br/>• Loading states and error handling<br/>• Real-time UI with JSONPlaceholder API |
| **[Fastify Server](./examples/example-fastify-server)** | Type-safe Fastify server implementation | • API server with in-memory repositories<br/>• Complete CRUD operations<br/>• Fastify framework integration |
| **[Express.js Server](./examples/express-app)** (Experimental) | Express.js server with API router | • Express middleware integration<br/>• Context management<br/>• User management endpoints<br/> |
| **[OpenAPI Generation](./examples/todo-app-openapi)** ([Generated OpenAPI Schema](./examples/todo-app-openapi/docs/openapi.html)) | Generate an OpenAPI 3.1 spec from API definitions | • Path params and request bodies derived from the request schema<br/>• Per-status response schemas via Zod `.meta({ statusCode })`<br/>• Redoc HTML output via [`zod-openapi`](https://www.npmjs.com/package/zod-openapi) |

Each example includes its own README with detailed setup instructions, architectural explanations, and usage examples. They range from simple client implementations to complete full-stack applications, demonstrating the flexibility and power of the framework across different use cases.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
