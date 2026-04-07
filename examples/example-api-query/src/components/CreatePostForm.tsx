/** biome-ignore-all lint/correctness/useUniqueElementIds: No unique ids */
import { useState } from 'react';
import { useAPIMutation } from '../App';

export function CreatePostForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [userId, setUserId] = useState(1);
  const [successMessage, setSuccessMessage] = useState('');

  const createPostMutation = useAPIMutation('createPost', {
    overrides: {
      onSuccess: (data) => {
        setTitle('');
        setBody('');
        setUserId(1);
        setSuccessMessage(`Post created successfully! ID: ${data.id}`);
        setTimeout(() => setSuccessMessage(''), 5000);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !body.trim()) {
      return;
    }

    createPostMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      userId,
    });
  };

  const isFormValid = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="create-post-container">
      <div className="section-header">
        <h2>Create New Post</h2>
        <p>Add a new post using the useAPIMutation hook</p>
      </div>

      {successMessage && (
        <div className="success-message">
          <span className="success-icon">✅</span>
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="create-post-form">
        <div className="form-group">
          <label htmlFor="userId" className="form-label">
            User ID
          </label>
          <select
            id="userId"
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            className="form-select"
            disabled={createPostMutation.isPending}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((id) => (
              <option key={id} value={id}>
                User {id}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="title" className="form-label">
            Post Title
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-input"
            placeholder="Enter a compelling title..."
            disabled={createPostMutation.isPending}
            maxLength={100}
          />
          <div className="input-help">{title.length}/100 characters</div>
        </div>

        <div className="form-group">
          <label htmlFor="body" className="form-label">
            Post Content
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="form-textarea"
            placeholder="Write your post content here..."
            disabled={createPostMutation.isPending}
            rows={8}
            maxLength={500}
          />
          <div className="input-help">{body.length}/500 characters</div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="submit-button"
            disabled={!isFormValid || createPostMutation.isPending}
          >
            {createPostMutation.isPending ? (
              <>
                <div className="loading-spinner small inline"></div>
                Creating Post...
              </>
            ) : (
              'Create Post'
            )}
          </button>

          <button
            type="button"
            className="reset-button"
            onClick={() => {
              setTitle('');
              setBody('');
              setUserId(1);
              setSuccessMessage('');
            }}
            disabled={createPostMutation.isPending}
          >
            Reset Form
          </button>
        </div>

        {createPostMutation.isError && (
          <div className="error-message">
            <span className="error-icon">❌</span>
            Error creating post:{' '}
            {createPostMutation.error?.message || 'Unknown error'}
          </div>
        )}
      </form>

      <div className="form-info">
        <h3>About this form</h3>
        <p>
          This form demonstrates the <code>useAPIMutation</code> hook from the
          api-query package. When you submit a post, it will:
        </p>
        <ul>
          <li>Send a POST request to the JSONPlaceholder API</li>
          <li>Handle loading states automatically</li>
          <li>Display success/error messages</li>
          <li>Invalidate the posts cache to trigger a refresh</li>
        </ul>
        <p>
          <em>
            Note: JSONPlaceholder is a demo API, so posts aren't actually saved
            permanently.
          </em>
        </p>
      </div>
    </div>
  );
}
