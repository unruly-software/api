# API Query React Example

This example demonstrates how to use the `@unruly-software/api-query` package to create a modern React application with type-safe API integration and React Query for caching and state management.

## What This Example Shows

- **React Query Integration**: Seamless integration between the API client and TanStack React Query
- **Type-Safe Hooks**: Full TypeScript inference with `useAPIQuery` and `useAPIMutation`
- **Automatic Cache Management**: Smart cache invalidation when mutations occur
- **Loading States**: Built-in loading, error, and success states
- **Real API Integration**: Uses the JSONPlaceholder API for live data
- **Modern UI**: Clean, responsive design with CSS Grid and Flexbox

## Features

### Posts Management
- View all posts with pagination support
- Expand individual posts to view comments
- Real-time comment loading with lazy evaluation
- Create new posts with form validation

### Users Directory
- Browse all users with detailed information
- Contact information with clickable links
- Company and address details
- Responsive card-based layout

### Interactive Form
- Create new posts with validation
- Real-time character counters
- Loading states and error handling
- Success notifications with auto-dismiss

## Architecture

### Component Structure
```
src/
├── App.tsx                    # Main app with QueryClient setup
├── main.tsx                   # React entry point
├── styles.css                 # Modern CSS styling
└── components/
    ├── PostsList.tsx          # Posts grid with useAPIQuery
    ├── PostItem.tsx           # Individual post with comments
    ├── UsersList.tsx          # Users directory
    └── CreatePostForm.tsx     # Post creation with useAPIMutation
```

### Key Implementation Details

#### API Query Setup
```typescript
const { useAPIQuery, useAPIMutation } = mountAPIQueryClient(
  jsonPlaceholderClient,
  queryClient,
  {
    createPost: {
      invalidates: () => [['getPosts']], // Auto-refresh posts after creation
    },
  }
);
```

#### Data Fetching with useAPIQuery
```typescript
// Fetch all posts
const { data: posts, isLoading, error } = useAPIQuery('getPosts');

// Fetch comments conditionally
const { data: comments } = useAPIQuery('getComments', {
  data: showComments ? { postId: post.id } : null, // null disables query
});
```

#### Mutations with useAPIMutation
```typescript
const createPostMutation = useAPIMutation('createPost', {
  overrides: {
    onSuccess: (data) => {
      // Handle success (cache is auto-invalidated)
      setSuccessMessage(`Post created! ID: ${data.id}`);
    },
  },
});

// Use the mutation
createPostMutation.mutate({
  title: 'My Post',
  body: 'Post content',
  userId: 1,
});
```

## Running the Example

### Development Server
```bash
# Start the development server
cd examples/example-api-query
yarn start
```

The app will open at `http://localhost:3000` with hot reload enabled.

### Build for Production
```bash
# Build optimized bundle
yarn build

# Preview production build
yarn preview
```

### Testing
```bash
# Run tests (if implemented)
yarn test
```

## Dependencies

- **React 19** - UI framework with latest features
- **@tanstack/react-query 5.x** - Data fetching and caching
- **@unruly-software/api-query** - Type-safe React Query hooks
- **@unruly-software/api-example-existing-api** - JSONPlaceholder API client
- **Vite** - Fast development server and bundler
- **TypeScript** - Type safety and developer experience

## API Endpoints Used

This example integrates with the JSONPlaceholder API through the existing API client:

- `getPosts()` - Fetch all blog posts
- `getComments(postId)` - Fetch comments for a specific post
- `getUsers()` - Fetch all user profiles
- `createPost(data)` - Create a new blog post

### Smart Cache Invalidation
When a new post is created, the posts cache is automatically invalidated, triggering a fresh fetch of all posts. This ensures the UI stays in sync without manual cache management.

### Conditional Queries
Comments are only fetched when a post is expanded, demonstrating how to use `null` data to disable queries until needed.
