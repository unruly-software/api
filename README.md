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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
