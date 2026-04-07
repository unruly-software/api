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

A type-safe API client built around Zod schemas. You describe each endpoint
once — request shape, response shape, and whatever metadata your transport
needs — and the client validates I/O on the way in and on the way out.

This is the core package of the
[`@unruly-software/api`](https://github.com/unruly-software/api) monorepo. It
is the only package you need to define endpoints and call them; the sibling
packages ([`api-server`](../api-server),
[`api-query`](../api-query),
[`api-server-express`](../api-server-express)) are optional layers that
consume the same definitions.

## Install

```bash
yarn add @unruly-software/api-client zod
```

`zod` is a peer dependency — version `^4.0.0`.

## Quick Start

Define your endpoints with `defineAPI`. The type parameter declares whatever
metadata your transport needs (HTTP method and path here, but it could be a
queue name, an IPC channel, an auth scope — whatever you want):

```typescript
import { defineAPI } from '@unruly-software/api-client';
import z from 'zod';

const api = defineAPI<{
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}>();

export const apiDefinition = {
  getUser: api.defineEndpoint({
    request: z.object({ userId: z.number() }),
    response: z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    }),
    metadata: { method: 'GET', path: '/users/:userId' },
  }),
};
```

Construct a client with a resolver — a single function that takes the
validated request and returns whatever the server sent back:

```typescript
import { APIClient } from '@unruly-software/api-client';

const client = new APIClient(apiDefinition, {
  resolver: async ({ definition, request, abortSignal }) => {
    const response = await fetch(
      `https://api.example.com${definition.metadata.path}`,
      {
        method: definition.metadata.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortSignal,
      },
    );
    return response.json();
  },
});
```

Call it. The result is fully typed from the response schema:

```typescript
const user = await client.request('getUser', { request: { userId: 123 } });
//    ^? { id: number; name: string; email: string }
```

## The resolver

The resolver is the only thing the client needs to function. It receives the
endpoint key, its full definition (including your metadata), the validated
request, and an `AbortSignal`. It returns whatever raw value the response
schema should parse.

```typescript
import type { APIResolver } from '@unruly-software/api-client';

const resolver: APIResolver<typeof apiDefinition> = async ({
  endpoint,    // 'getUser'
  definition,  // the full endpoint definition with your metadata
  request,     // already validated against the request schema
  abortSignal, // forward to fetch / your transport
}) => {
  // Any transport works: fetch, axios, websocket, IPC, in-memory, a mock.
  return await transport.send(definition.metadata, request);
};
```

Anything the resolver throws becomes the error the caller sees (after the
error formatter, if you've installed one). That's the hook the next section
uses to turn server errors into typed exceptions.

## Throwing typed errors from your server

The error formatter is the recommended place to convert raw transport errors
into domain-specific error classes that callers can `catch` by `instanceof`.
The full round trip looks like this:

**1. Throw a domain error on the server.** Define a class your handlers can
throw, then teach the Express adapter how to serialise it. The
[`api-server-express`](../api-server-express) package accepts a `handleError`
option exactly for this:

```typescript
// shared/errors.ts
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

```typescript
// server.ts
import { mountExpressApp } from '@unruly-software/api-server-express';
import { NotFoundError } from './shared/errors';

mountExpressApp({
  app,
  router,
  makeContext: async (req) => ({ /* ... */ }),
  handleError: ({ error, res }) => {
    if (error instanceof NotFoundError) {
      res.status(404).json({ code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ code: 'INTERNAL', message: error.message });
  },
});
```

A handler can now `throw new NotFoundError('User 123 not found')` and the
server will respond with a recognisable JSON envelope.

**2. Surface the body from the client resolver.** Keep the resolver dumb — it
just throws whatever the server returned, with enough context for the
formatter to classify it:

```typescript
class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

const client = new APIClient(apiDefinition, {
  resolver: async ({ definition, request, abortSignal }) => {
    const response = await fetch(
      `https://api.example.com${definition.metadata.path}`,
      {
        method: definition.metadata.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortSignal,
      },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new APIError(body.message ?? response.statusText, response.status, body.code);
    }

    return response.json();
  },
});
```

**3. Convert it in the error formatter.** Define a matching class on the
client and re-throw it from `setErrorFormatter`. The formatter receives the
*original* thrown error, so `instanceof` checks work:

```typescript
import { NotFoundError } from './shared/errors';

client.setErrorFormatter((error, context) => {
  if (context.stage === 'resolver' && error instanceof APIError) {
    if (error.code === 'NOT_FOUND') {
      return new NotFoundError(error.message);
    }
  }
  return error;
});
```

**4. Catch it by class at the call site.**

```typescript
try {
  const user = await client.request('getUser', { request: { userId: 123 } });
} catch (e) {
  if (e instanceof NotFoundError) {
    // render a 404 state, redirect, whatever
    return;
  }
  throw e;
}
```

### The three formatter stages

`context.stage` is one of `'request-validation'`, `'resolver'`, or
`'response-validation'`:

| Stage | When it fires | Published to `$failed`? |
|---|---|---|
| `request-validation` | Zod rejects the input you passed to `client.request` | No |
| `resolver` | Your resolver throws (network failure, server error, etc.) | **Yes** |
| `response-validation` | Zod rejects what the resolver returned | No |

Only the `resolver` stage publishes to `$failed`, so put cross-cutting
"a request failed" telemetry in the formatter or in a `$failed` subscriber
depending on whether you also want validation failures.

## Cancelling requests

Pass an `AbortSignal` to `request`. The client forwards it to the resolver as
`abortSignal`:

```typescript
const controller = new AbortController();

const promise = client.request('getUser', {
  request: { userId: 123 },
  abort: controller.signal,
});

controller.abort();
```

## Observing requests

Every client exposes two topics. Subscribe to either; the returned function
unsubscribes.

```typescript
const offSuccess = client.$succeeded.subscribe(({ endpoint, request, response }) => {
  console.log(`✓ ${String(endpoint)}`, { request, response });
});

const offFailure = client.$failed.subscribe(({ endpoint, request, error }) => {
  console.error(`✗ ${String(endpoint)}`, { request, error });
});
```

Remember that `$failed` only fires for resolver-stage errors. Validation
failures throw without publishing — handle those in the error formatter if
you need to observe them.

## Other packages in this monorepo

| Package | When you'd reach for it |
|---|---|
| **[`@unruly-software/api-server`](../api-server)** | When you also own the server side and want typed handlers with shared definitions and a context object. |
| **[`@unruly-software/api-query`](../api-query)** | When you're using `@tanstack/react-query` and want typed `useAPIQuery` / `useAPIMutation` hooks with declarative cache invalidation. |
| **[`@unruly-software/api-server-express`](../api-server-express)** *(experimental)* | When you want to plug an `api-server` router into an Express app, including the `handleError` hook used above. |

For end-to-end walkthroughs — including the typed-error round trip against a
real Express server — see the [examples directory](../../examples), in
particular [`examples/express-app`](../../examples/express-app). The root
[README](../../README.md) covers the design rationale and how this framework
compares to tRPC, GraphQL, OpenAPI, gRPC, ts-rest, and Zodios.

## License

MIT
