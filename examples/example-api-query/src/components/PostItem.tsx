import type { Post } from '@unruly-software/api-example-existing-api';
import { useState } from 'react';
import { useAPIQuery } from '../App';

interface PostItemProps {
  post: Post;
}

export function PostItem({ post }: PostItemProps) {
  const [showComments, setShowComments] = useState(false);

  const {
    data: comments,
    isLoading: loadingComments,
    error: commentsError,
  } = useAPIQuery('getComments', {
    data: showComments ? { postId: post.id } : null,
  });

  const toggleComments = () => {
    setShowComments(!showComments);
  };

  return (
    <article className="post-item">
      <header className="post-header">
        <h3 className="post-title">{post.title}</h3>
        <span className="post-id">#{post.id}</span>
      </header>

      <div className="post-body">
        <p>{post.body}</p>
      </div>

      <footer className="post-footer">
        <span className="post-meta">by User #{post.userId}</span>
        <button
          type="button"
          className="comments-toggle"
          onClick={toggleComments}
          disabled={loadingComments}
        >
          {showComments ? '▼' : '▶'} Comments
          {loadingComments && ' (loading...)'}
        </button>
      </footer>

      {showComments && (
        <div className="comments-section">
          {loadingComments && (
            <div className="comments-loading">
              <div className="loading-spinner small"></div>
              Loading comments...
            </div>
          )}

          {commentsError && (
            <div className="comments-error">
              <p>Error loading comments: {commentsError.message}</p>
            </div>
          )}

          {comments && comments.length > 0 && (
            <div className="comments-list">
              <h4>Comments ({comments.length})</h4>
              {comments.map((comment) => (
                <div key={comment.id} className="comment">
                  <div className="comment-header">
                    <strong className="comment-name">{comment.name}</strong>
                    <span className="comment-email">{comment.email}</span>
                  </div>
                  <div className="comment-body">
                    <p>{comment.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {comments && comments.length === 0 && (
            <div className="no-comments">
              <p>No comments yet for this post.</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
