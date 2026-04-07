import { useAPIQuery } from '../App';

export function UsersList() {
  const {
    data: users,
    isLoading,
    error,
  } = useAPIQuery('getUsers', { data: undefined });

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error loading users</h2>
        <p>{error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="empty-state">
        <h2>No users found</h2>
        <p>There are currently no users to display.</p>
      </div>
    );
  }

  return (
    <div className="users-container">
      <div className="section-header">
        <h2>Users ({users.length})</h2>
        <p>User directory from the JSONPlaceholder API</p>
      </div>

      <div className="users-grid">
        {users.map((user) => (
          <div key={user.id} className="user-card">
            <div className="user-header">
              <h3 className="user-name">{user.name}</h3>
              <span className="user-username">@{user.username}</span>
            </div>

            <div className="user-details">
              <div className="detail-item">
                <span className="detail-label">Email:</span>
                <a href={`mailto:${user.email}`} className="detail-value email">
                  {user.email}
                </a>
              </div>

              <div className="detail-item">
                <span className="detail-label">Phone:</span>
                <a href={`tel:${user.phone}`} className="detail-value phone">
                  {user.phone}
                </a>
              </div>

              <div className="detail-item">
                <span className="detail-label">Website:</span>
                <a
                  href={
                    user.website.startsWith('http')
                      ? user.website
                      : `https://${user.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-value website"
                >
                  {user.website}
                </a>
              </div>

              <div className="detail-item">
                <span className="detail-label">Address:</span>
                <div className="detail-value address">
                  {user.address.street}, {user.address.suite}
                  <br />
                  {user.address.city} {user.address.zipcode}
                </div>
              </div>

              <div className="detail-item">
                <span className="detail-label">Company:</span>
                <div className="detail-value company">
                  <strong>{user.company.name}</strong>
                  <br />
                  <em>{user.company.catchPhrase}</em>
                  <br />
                  <small>{user.company.bs}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
