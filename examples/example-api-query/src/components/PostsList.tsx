import { useAPIQuery } from '../App';
import { CreatePostForm } from './CreatePostForm';
import { PostItem } from './PostItem';

export function PostsList() {
  const {
    data: posts,
    isFetching,
    error,
  } = useAPIQuery('getPosts', { overrides: {} });

  if (isFetching) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading posts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error loading posts</h2>
        <p>{error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="empty-state">
        <h2>No posts found</h2>
        <p>There are currently no posts to display.</p>
      </div>
    );
  }

  return (
    <div className="posts-container">
      <CreatePostForm />

      <div className="section-header">
        <h2>Posts ({posts.length})</h2>
        <p>Recent posts from the JSONPlaceholder API</p>
      </div>

      <div className="posts-grid">
        {posts.map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
