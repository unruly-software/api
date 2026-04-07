# JSONPlaceholder API Client Example

This example demonstrates how to use the `@unruly-software/api-client` package to create a type-safe API client for an existing public API - in this case, [JSONPlaceholder](https://jsonplaceholder.typicode.com/).

## What This Example Shows

- **API Definition**: How to define endpoints with Zod schemas for request/response validation
- **Type Safety**: Full TypeScript inference across client-server boundaries
- **HTTP Resolver**: Implementation of an HTTP resolver using the native fetch API
- **Integration Testing**: Real API integration tests that verify the client works with a live service
- **Error Handling**: Proper error handling and schema validation
- **Event System**: Subscribing to success/failure events from API calls

## Structure

- `src/schemas.ts`: Zod schemas for JSONPlaceholder API entities (Posts, Comments, Users)
- `src/api-definition.ts`: API endpoint definitions with request/response schemas
- `src/client.ts`: Configured API client instance with an HTTP resolver
- `src/client.test.ts`: Integration tests that call the real JSONPlaceholder API
- `src/index.ts`: Public exports

## API Endpoints

This example implements the following JSONPlaceholder endpoints:

- `getPosts()` - Fetch all posts
- `getPost(id)` - Fetch a single post by ID
- `createPost(data)` - Create a new post
- `getComments(postId)` - Fetch comments for a specific post
- `getUsers()` - Fetch all users

## Running the Tests

```bash
# Install dependencies
yarn install

# Run integration tests
yarn test

# Run tests with watch mode
yarn test --watch
```

## Usage Example

```typescript
import { jsonPlaceholderClient } from './src/client.js';

// Fetch all posts (fully typed response)
const posts = await jsonPlaceholderClient.request('getPosts');

// Fetch a specific post
const post = await jsonPlaceholderClient.request('getPost', {
  request: { id: 1 }
});

// Create a new post
const newPost = await jsonPlaceholderClient.request('createPost', {
  request: {
    title: 'My New Post',
    body: 'Post content here...',
    userId: 1
  }
});

// Subscribe to success events
jsonPlaceholderClient.$succeeded.subscribe((event) => {
  console.log(`✅ ${event.endpoint} succeeded:`, event.response);
});

// Subscribe to error events
jsonPlaceholderClient.$failed.subscribe((event) => {
  console.log(`❌ ${event.endpoint} failed:`, event.error);
});
```

This example demonstrates the power of the API client package - you get full type safety, automatic validation, event notifications, and clean separation between API definition and implementation.
