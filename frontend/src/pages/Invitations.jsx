import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function Invitations() {
  const { session } = useAuth();
  const navigate = useNavigate();
  
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const token = session?.access_token;
      
      const response = await fetch(`${API_URL}/api/invitations?status=pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch invitations');
      }
      
      const data = await response.json();
      setInvitations(data.invitations || []);
      setError('');
    } catch (err) {
      console.error('Fetch invitations error:', err);
      setError('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async (invitation) => {
    try {
      setProcessingId(invitation._id);
      const token = session?.access_token;
      
      const response = await fetch(`${API_URL}/api/invitations/${invitation.token}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept invitation');
      }
      
      const data = await response.json();
      
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv._id !== invitation._id));
      
      // Navigate to the whiteboard
      if (data.whiteboard?.id) {
        navigate(`/whiteboard/${data.whiteboard.id}`);
      }
    } catch (err) {
      console.error('Accept invitation error:', err);
      alert(err.message || 'Failed to accept invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const declineInvitation = async (invitation) => {
    if (!window.confirm('Are you sure you want to decline this invitation?')) {
      return;
    }

    try {
      setProcessingId(invitation._id);
      const token = session?.access_token;
      
      const response = await fetch(`${API_URL}/api/invitations/${invitation.token}/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to decline invitation');
      }
      
      // Remove from list
      setInvitations(prev => prev.filter(inv => inv._id !== invitation._id));
    } catch (err) {
      console.error('Decline invitation error:', err);
      alert(err.message || 'Failed to decline invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getRoleColor = (role) => {
    return role === 'editor' 
      ? 'bg-green-100 text-green-700' 
      : 'bg-blue-100 text-blue-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invitations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pending Invitations</h1>
        <p className="text-gray-600">
          Whiteboard invitations waiting for your response
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
      )}

      {/* Invitations list */}
      {invitations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
          <i className="fa-solid fa-envelope-open text-5xl text-gray-300 mb-4"></i>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No pending invitations</h3>
          <p className="text-gray-500 mb-4">You don't have any whiteboard invitations at the moment</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-primary"
          >
            <i className="fa-solid fa-table-columns mr-2"></i>
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {invitations.map(invitation => (
            <div
              key={invitation._id}
              className="bg-white rounded-lg border shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                {/* Invitation info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <i className="fa-solid fa-chalkboard text-primary text-xl"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        {invitation.whiteboardId?.title || 'Untitled Whiteboard'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Invited {formatDate(invitation.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(invitation.role)}`}>
                      {invitation.role}
                    </span>
                    <span>
                      <i className="fa-solid fa-user mr-1"></i>
                      To: {invitation.recipientEmail}
                    </span>
                  </div>

                  {invitation.message && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <p className="text-sm text-gray-700 italic">"{invitation.message}"</p>
                    </div>
                  )}

                  {/* Expiry warning */}
                  {new Date(invitation.expiresAt) < new Date(Date.now() + 24 * 60 * 60 * 1000) && (
                    <div className="flex items-center gap-2 text-sm text-orange-600 mb-4">
                      <i className="fa-solid fa-clock"></i>
                      <span>Expires soon! Accept before {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 ml-4">
                  <button
                    onClick={() => acceptInvitation(invitation)}
                    disabled={processingId === invitation._id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {processingId === invitation._id ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        Processing...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-check"></i>
                        Accept
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => declineInvitation(invitation)}
                    disabled={processingId === invitation._id}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="fa-solid fa-times"></i>
                    Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}