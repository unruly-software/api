# TODO API — OpenAPI generation example

Generates an OpenAPI 3.1 document directly from `@unruly-software/api-client`
endpoint definitions, with no duplication between the API definition and the
spec.

The rendered output lives at [`docs/openapi.html`](./docs/openapi.html).

## What this demonstrates

- One Zod schema per request/response, used as both runtime validation and
  OpenAPI source.
- HTTP method, path, summary, description, and tags live on
  `defineEndpoint({ metadata })`.
- Path parameters, query parameters, and request bodies are derived from the
  endpoint's `request` schema and the `path` template — no hand-written param
  lists.
- Response status codes, descriptions, and schemas are derived from each
  member of the `response` union by tagging it with `.meta({ statusCode,
  description })`.

## Run it

```bash
yarn build
```

This type-checks the example, regenerates `docs/openapi.html` (Redoc), and
writes it to disk.

## Defining an endpoint

```ts
import { defineAPI } from '@unruly-software/api-client';

const api = defineAPI<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  tags: string[];
}>();

export const todoAPI = {
  updateTodo: api.defineEndpoint({
    request: z
      .object({ id: GetTodoParamsSchema.shape.id })
      .merge(UpdateTodoSchema),
    response: z.union([
      TodoItemSchema.meta({
        statusCode: 200,
        description: 'Todo updated successfully',
      }),
      ErrorResponseSchema.meta({
        statusCode: 400,
        description: 'Invalid request data',
      }),
      ErrorResponseSchema.meta({
        statusCode: 404,
        description: 'Todo not found',
      }),
    ]),
    metadata: {
      method: 'PUT',
      path: '/todos/{id}',
      summary: 'Update a todo',
      description: 'Update an existing todo item by its ID',
      tags: ['Todos'],
    },
  }),
};
```

The metadata generic can be extended to document any other fields or change the
implementation of the generator.

## How the generator works

`src/generate-openapi.ts` walks every endpoint in `todoAPI` and produces an
OpenAPI operation in three steps.

### 1. Path parameters are pulled from the request schema

The `path` template (`/todos/{id}`) is scanned for `{name}` placeholders.
Those keys are `pick`ed off the request `ZodObject` and become the operation's
`path` parameters; the remainder becomes either `query` (for `GET`/`DELETE`)
or `requestBody` (for `POST`/`PUT`).

### 2. Responses are pulled from the response union

`.meta()` in zod v4 clones the schema and stores arbitrary metadata in
`globalRegistry`. Calling `ErrorResponseSchema.meta({ statusCode: 404, ... })`
twice with different statuses produces two distinct instances, so a shared
error schema can appear under different status codes across endpoints without
collision.

The generator walks the response union's `options` and reads each member's
metadata back via `member.meta()`:

### 3. The operation is assembled

The endpoint name is used as the OpenAPI `operationId`, summary/description/
tags come straight from `metadata`, and the request/response sections come
from the two helpers above. See `src/generate-openapi.ts` for the full loop.

## Files

```
src/
  schemas.ts          Zod schemas (shared bodies and descriptions)
  api-definition.ts   Endpoint definitions via defineAPI
  generate-openapi.ts createDocument call + paths generator
  create-docs.ts      Renders docs/openapi.html via Redoc
docs/openapi.html     Generated documentation
```
