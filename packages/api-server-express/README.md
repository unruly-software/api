# @unruly-software/api-server-express EXPERIMENTAL

The express package is currently in an experimental stage and may undergo
significant changes or become unsupported.

<div align="center">

<img src="https://github.com/unruly-software/api/blob/master/docs/logo.png" alt="Unruly Software API Framework" width="200" />

<br />
<br />

</div>

[![NPM Version](https://img.shields.io/npm/v/@unruly-software/api-server-express?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-server-express)
[![License](https://img.shields.io/github/license/unruly-software/api?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/unruly-software/api/blob/main/LICENSE)
[![Coverage Status](https://img.shields.io/coverallsCoverage/github/unruly-software/api?branch=master&style=flat&colorA=18181B&colorB=28CF8D)](https://coveralls.io/github/unruly-software/api?branch=master)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@unruly-software/api-server-express?style=flat&colorA=18181B&colorB=28CF8D&label=bundle%20size)](https://bundlephobia.com/package/@unruly-software/api-server-express)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?style=flat&colorA=18181B&colorB=3178c6)](https://www.typescriptlang.org/)
[![Downloads](https://img.shields.io/npm/dm/@unruly-software/api-server-express?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@unruly-software/api-server-express)

Express.js adapter for `@unruly-software/api-server` that provides seamless
integration between your type-safe API routers and Express.js applications.
Automatically handles request routing, body parsing, context injection, and
error handling.

## Quick Start

Install the package:

```bash
npm install @unruly-software/api-server-express @unruly-software/api-server @unruly-software/api-client express
# or
yarn add @unruly-software/api-server-express @unruly-software/api-server @unruly-software/api-client express
```

Create an Express app from your API router:

```typescript
import { defineAPI } from '@unruly-software/api-client';
import { defineRouter } from '@unruly-software/api-server';
import { createExpressApp } from '@unruly-software/api-server-express';
import express from 'express';
import z from 'zod';

// Define your API
const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

const userAPI = {
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

// Define context and implement router
type AppContext = {
  db: Database;
  userService: UserService;
};

const router = defineRouter<typeof userAPI, AppContext>({
  definitions: userAPI,
});

const implementedRouter = router.implement({
  endpoints: {
    getUser: router
      .endpoint('getUser')
      .handle(async ({ context, data }) => {
        return await context.userService.findById(data.userId);
      }),

    createUser: router
      .endpoint('createUser')
      .handle(async ({ context, data }) => {
        return await context.userService.create(data);
      }),
  },
});

// Create Express app with automatic routing
const app = createExpressApp(implementedRouter, {
  context: { db, userService },
  basePath: '/api',
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## License

MIT
