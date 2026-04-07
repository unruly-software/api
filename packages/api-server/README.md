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

A typed router for implementing the endpoint definitions you declared with
[`@unruly-software/api-client`](../api-client). It validates incoming
requests and outgoing responses against your Zod schemas, injects an
application-defined context into every handler, and stays out of the way of
the actual transport.

This is an optional sibling of the core
[`@unruly-software/api-client`](../api-client) package in the
[`@unruly-software/api`](https://github.com/unruly-software/api) monorepo.
Use it when you also own the server side and want to share the same
definitions across both ends. The router has no opinion about HTTP — see
[`@unruly-software/api-server-express`](../api-server-express) for one way to
mount it on Express, or call `dispatch` yourself from any framework.

## Install

```bash
yarn add @unruly-software/api-server @unruly-software/api-client zod
```

`@unruly-software/api-client` is a peer dependency; `zod` (`^4.0.0`) is a
peer dependency of `api-client`.

## Quick Start

Share an endpoint definition between client and server. The schemas, types,
and metadata all come from the definition file:

```typescript
// shared/api-definition.ts
import { defineAPI } from '@unruly-software/api-client';
import z from 'zod';

const api = defineAPI<{ path: string; method: 'GET' | 'POST' }>();

const User = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

export const apiDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: User,
    metadata: { method: 'GET', path: '/users/:userId' },
  }),
};
```

Build a router. The second type parameter is your application context — the
shape of whatever the handlers need (database, services, current user,
etc.). You provide it on every `dispatch`:

```typescript
// server/router.ts
import { defineRouter } from '@unruly-software/api-server';
import { apiDefinition } from '../shared/api-definition';
import type { UserRepo } from './user-repo';

type AppContext = { userRepo: UserRepo };

const router = defineRouter<typeof apiDefinition, AppContext>({
  definitions: apiDefinition,
});

const getUser = router
  .endpoint('getUser')
  .handle(async ({ context, data }) => {
    // data is { userId: number } — already validated against the request schema
    // context is AppContext
    return await context.userRepo.get(data.userId);
  });

export const apiRouter = router.implement({
  endpoints: { getUser },
});
```

Dispatch a request. This is the entry point any transport adapter calls
into:

```typescript
const user = await apiRouter.dispatch({
  endpoint: 'getUser',
  data: { userId: 123 },
  context: { userRepo },
});
```

`dispatch` parses `data` against the request schema, runs the handler, then
parses the return value against the response schema. Anything that fails
validation throws a `ZodError`. Anything the handler throws propagates
unchanged — see [Errors](#errors) below.

## How requests flow

`dispatch` is the only execution path. Every request goes through the same
three steps:

1. **Request validation.** `definition.request.parse(data)` runs, throwing
   `ZodError` on failure. If the endpoint's request schema is `null`, this
   step is skipped.
2. **Handler.** Your handler is called with `{ data, context, definition }`,
   where `data` is the parsed (and possibly transformed) request.
3. **Response validation.** `definition.response.parse(returnValue)` runs,
   also throwing `ZodError` on mismatch. Skipped when the response schema
   is `null`.

There is no middleware chain, no request lifecycle, and no automatic error
wrapping. Build whatever cross-cutting behaviour you need (auth, logging,
transactions) by composing your context — see below.

## Context as dependency injection

The context type is yours. The router treats it as an opaque value that's
forwarded to every handler. The integration layer (Express adapter, your
own HTTP server, a queue worker, a test harness) is responsible for
producing it per request:

```typescript
// What "auth middleware" looks like: build it into the context.
const makeContext = async (req: Request): Promise<AppContext> => {
  const session = await loadSession(req);
  return {
    userRepo: new UserRepo(db),
    currentUser: session?.user ?? null,
    log: logger.child({ requestId: req.id }),
  };
};

await apiRouter.dispatch({
  endpoint: 'getUser',
  data: req.body,
  context: await makeContext(req),
});
```

This keeps the router framework-agnostic. It also means handlers can be
called from anywhere — tests, scripts, queue consumers — by constructing a
context object directly.

## Errors

`dispatch` doesn't catch anything:

- **Request validation failures** throw `ZodError`.
- **Handler errors** propagate as-is. Throw whatever class you want — the
  caller (or the transport adapter) decides how to surface it.
- **Response validation failures** throw `ZodError`.

The recommended pattern is to throw domain error classes from handlers and
let the transport adapter map them to a wire format. The Express adapter,
for example, accepts a `handleError` option that can recognise a
`NotFoundError` and respond with HTTP 404. The full round trip
(server-side throw → JSON envelope → client-side typed exception) is
documented in the [`api-client` README](../api-client/README.md#throwing-typed-errors-from-your-server).

```typescript
class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

const getUser = router
  .endpoint('getUser')
  .handle(async ({ context, data }) => {
    const user = await context.userRepo.get(data.userId);
    if (!user) throw new NotFoundError(`User ${data.userId} not found`);
    return user;
  });
```

## Composing routers

Split a large API across multiple files and merge them at the edge with
`mergeImplementedRouters`. Definitions are unioned and context types are
intersected, so the merged router needs a context that satisfies both
inputs:

```typescript
import { mergeImplementedRouters } from '@unruly-software/api-server';
import { userRouter } from './user-router';
import { orderRouter } from './order-router';

export const apiRouter = mergeImplementedRouters(userRouter, orderRouter);
// dispatch needs a context that satisfies both UserContext & OrderContext
```

## Mounting on a transport

The router has no built-in HTTP support. To serve it, walk
`apiRouter.definitions`, read the metadata you declared, and call
`apiRouter.dispatch` from your framework's request handler. The
[`api-server-express`](../api-server-express) package is one ready-made
example; the [`examples/`](../../examples) directory contains Fastify and
Express versions you can copy from.

## Other packages in this monorepo

| Package | When you'd reach for it |
|---|---|
| **[`@unruly-software/api-client`](../api-client)** | The core. Defines the endpoint shape and runs the client side; this package is built on top of its definitions. |
| **[`@unruly-software/api-query`](../api-query)** | Typed `useAPIQuery` / `useAPIMutation` hooks for `@tanstack/react-query`, against the same definitions. |
| **[`@unruly-software/api-server-express`](../api-server-express)** *(experimental)* | Mounts an implemented router on an Express app and provides a `handleError` hook. |

For end-to-end walkthroughs see the [examples directory](../../examples)
(`express-app`, `example-fastify-server`, and `todo-app-openapi` all use
this package). The root [README](../../README.md) covers the design
rationale and how the framework compares to tRPC, GraphQL, OpenAPI, gRPC,
ts-rest, and Zodios.

## License

MIT
