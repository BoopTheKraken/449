import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../utils/api';

export default function InviteAccept() {
  const { token } = useParams();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      fetchInvitation();
    }
  }, [token, authLoading]);

  const fetchInvitation = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/invitations/${token}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load invitation');
      }
      
      const data = await response.json();
      setInvitation(data.invitation);
      setError('');
    } catch (err) {
      console.error('Fetch invitation error:', err);
      setError(err.message || 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!session) {
      // Redirect to login with returnTo
      navigate(`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }

    try {
      setAccepting(true);
      const authToken = session?.access_token;
      
      const response = await fetch(`${API_URL}/api/invitations/${token}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept invitation');
      }
      
      const data = await response.json();
      
      // Success! Navigate to the whiteboard
      if (data.whiteboard?.id) {
        navigate(`/whiteboard/${data.whiteboard.id}`);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Accept invitation error:', err);
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    navigate('/dashboard');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-beige to-light-blue flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-beige to-light-blue flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-exclamation-triangle text-3xl text-red-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Invalid Invitation</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            to="/dashboard"
            className="btn btn-primary w-full"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  const isExpired = new Date(invitation.expiresAt) < new Date();
  const getRoleColor = (role) => {
    return role === 'editor' 
      ? 'bg-green-100 text-green-700' 
      : 'bg-blue-100 text-blue-700';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-beige to-light-blue flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-envelope text-3xl text-primary"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Whiteboard Invitation</h2>
        </div>

        <div className="space-y-4 mb-6">
          {/* Whiteboard info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <i className="fa-solid fa-chalkboard text-primary"></i>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {invitation.whiteboardId?.title || 'Untitled Whiteboard'}
                </h3>
                <p className="text-sm text-gray-500">Collaborative Whiteboard</p>
              </div>
            </div>
          </div>

          {/* Invitation details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Role:</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(invitation.role)}`}>
                {invitation.role === 'editor' ? 'Can Edit' : 'View Only'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Invited to:</span>
              <span className="font-medium text-gray-900">{invitation.recipientEmail}</span>
            </div>
            {!isExpired && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Expires:</span>
                <span className="text-gray-900">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Message if any */}
          {invitation.message && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
              <p className="text-sm text-gray-700 italic">"{invitation.message}"</p>
            </div>
          )}

          {/* Expiry warning */}
          {isExpired && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <i className="fa-solid fa-exclamation-circle text-red-600 mt-0.5"></i>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">This invitation has expired</p>
                <p className="text-xs text-red-600 mt-1">Contact the whiteboard owner for a new invitation</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!session ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 text-center mb-4">
              Please log in to accept this invitation
            </p>
            <button
              onClick={() => navigate(`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`)}
              className="btn btn-primary w-full"
            >
              <i className="fa-solid fa-right-to-bracket mr-2"></i>
              Log in to Accept
            </button>
            <p className="text-xs text-gray-500 text-center">
              Don't have an account?{' '}
              <Link 
                to={`/register?returnTo=${encodeURIComponent(`/invite/${token}`)}`}
                className="text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {isExpired ? (
              <Link
                to="/dashboard"
                className="btn bg-gray-600 text-white w-full hover:bg-gray-700"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {accepting ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                      Accepting...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check mr-2"></i>
                      Accept Invitation
                    </>
                  )}
                </button>
                <button
                  onClick={handleDecline}
                  disabled={accepting}
                  className="btn bg-white border-2 border-gray-300 text-gray-700 w-full hover:bg-gray-50 disabled:opacity-50"
                >
                  <i className="fa-solid fa-times mr-2"></i>
                  Decline
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}