# Fastify Server Example with JSONPlaceholder API

This example demonstrates how to use the `@unruly-software/api-server` package to create a type-safe Fastify server that implements the JSONPlaceholder API definition from the `example-existing-api`.

## What This Example Shows

- **API Server Implementation**: How to implement server endpoints using `@unruly-software/api-server`
- **Fastify Integration**: Setting up a Fastify server with the API router
- **In-Memory Database**: Simple in-memory repositories for Posts, Users, and Comments
- **Type Safety**: Full TypeScript inference across server endpoints
- **Integration Testing**: Complete end-to-end tests using the API client with a custom resolver
- **Error Handling**: Proper validation and error responses

## Structure

- `src/repositories/`: In-memory data repositories with seed data
  - `user-repo.ts`: User repository with sample user data
  - `post-repo.ts`: Post repository with sample posts
  - `comment-repo.ts`: Comment repository with sample comments
- `src/router.ts`: API router implementation using the api-server library
- `src/server.ts`: Fastify server setup with endpoint routing
- `src/server.test.ts`: Integration tests demonstrating client-server interaction
- `src/index.ts`: Public exports

## API Endpoints

This server implements the same JSONPlaceholder endpoints as the client example:

- `getPosts()` - Fetch all posts
- `getPost(id)` - Fetch a single post by ID
- `createPost(data)` - Create a new post
- `getComments(postId)` - Fetch comments for a specific post
- `getUsers()` - Fetch all users

## Running the Server

```bash
# Install dependencies
yarn install

# Start the development server
yarn start

# The server will be available at http://localhost:3000
```

## Running Tests

```bash
# Run integration tests
yarn test

# Run tests with watch mode
yarn test --watch

# Build (type check)
yarn build
```

## Usage Example

The server provides a generic POST endpoint at `/api/{endpoint}` that dispatches requests to the appropriate handlers:

```bash
# Get all users
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{}'

# Get a specific post
curl -X POST http://localhost:3000/api/post \
  -H "Content-Type: application/json" \
  -d '{"id": 1}'

# Create a new post
curl -X POST http://localhost:3000/api/createPost \
  -H "Content-Type: application/json" \
  -d '{"title": "My Post", "body": "Post content", "userId": 1}'

# Get comments for a post
curl -X POST http://localhost:3000/api/comments \
  -H "Content-Type: application/json" \
  -d '{"postId": 1}'
```

## Integration with API Client

The tests demonstrate how to use the `@unruly-software/api-client` with a custom resolver to communicate with the local Fastify server:

```typescript
import { APIClient } from '@unruly-software/api-client';
import { jsonPlaceholderAPI } from '../example-existing-api/src/api-definition.js';

const client = new APIClient(jsonPlaceholderAPI, {
  resolver: async ({ definition, request, abortSignal }) => {
    const response = await fetch(`http://localhost:3000/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: abortSignal,
    });

    return response.json();
  },
});

// Now you can use the client with full type safety
const posts = await client.request('getPosts');
const newPost = await client.request('createPost', {
  request: { title: 'New Post', body: 'Content', userId: 1 }
});
```

## Key Features

- **Type Safety**: Complete TypeScript inference from API definition to server handlers
- **Schema Validation**: Automatic request and response validation using Zod schemas
- **Error Handling**: Proper error responses for invalid requests and missing resources
- **In-Memory Storage**: Simple repositories that persist data during server runtime
- **Integration Testing**: Comprehensive tests that verify the entire request/response cycle
- **Modular Design**: Clear separation between repositories, routing, and server setup

This example demonstrates the power of the api-server package - you get full type safety, automatic validation, and clean separation between API definition and server implementation, while being able to use any HTTP framework (in this case, Fastify).