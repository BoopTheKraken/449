import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import InviteModal from '../components/InviteModal';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const HISTORY_LIMIT = 50; // keep list pulls small

export default function Dashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [whiteboards, setWhiteboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedWhiteboard, setSelectedWhiteboard] = useState(null);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [joinSessionId, setJoinSessionId] = useState('');
  const [filter, setFilter] = useState('all'); // all | owned | shared

  // auth header helper
  const authHeader = useMemo(() => {
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [session?.access_token]);

  useEffect(() => {
    if (!session) return; // wait for auth
    fetchWhiteboards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const fetchWhiteboards = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_URL}/api/whiteboards?limit=${HISTORY_LIMIT}`, {
        headers: { ...authHeader },
      });
      if (!res.ok) throw new Error(`load_boards_${res.status}`);
      const data = await res.json();
      setWhiteboards(Array.isArray(data.whiteboards) ? data.whiteboards : []);
    } catch (err) {
      console.error('wb:list', err);
      setError('Could not load boards');
    } finally {
      setLoading(false);
    }
  };

  const createWhiteboard = async () => {
    try {
      const title = newBoardTitle.trim() || 'Untitled Whiteboard';
      const res = await fetch(`${API_URL}/api/whiteboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`create_board_${res.status}`);
      const data = await res.json();
      setCreateModalOpen(false);
      setNewBoardTitle('');
      navigate(`/whiteboard/${data.whiteboard._id}`);
    } catch (err) {
      console.error('wb:create', err);
      setError('Could not create board');
    }
  };

  const joinWhiteboard = async () => {
    const sessionId = joinSessionId.trim();
    if (!sessionId) {
      setError('Enter a session ID');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/whiteboards/${sessionId}`, {
        headers: { ...authHeader },
      });

      if (!res.ok) {
        if (res.status === 404) setError('Board not found');
        else if (res.status === 403) setError('No access to this board');
        else setError('Could not join');
        return;
      }

      setJoinModalOpen(false);
      setJoinSessionId('');
      setError('');
      navigate(`/whiteboard/${sessionId}`);
    } catch (err) {
      console.error('wb:join', err);
      setError('Could not join');
    }
  };

  const openWhiteboard = (id) => navigate(`/whiteboard/${id}`);

  const deleteWhiteboard = async (id) => {
    if (!window.confirm('Delete this whiteboard?')) return;

    try {
      const res = await fetch(`${API_URL}/api/whiteboards/${id}`, {
        method: 'DELETE',
        headers: { ...authHeader },
      });
      if (!res.ok) throw new Error(`delete_board_${res.status}`);
      setWhiteboards((prev) => prev.filter((wb) => wb._id !== id));
    } catch (err) {
      console.error('wb:delete', err);
      setError('Could not delete');
    }
  };

  const shareWhiteboard = (id) => {
    navigator.clipboard
      .writeText(id)
      .then(() => {
        alert(`Session ID copied:\n${id}`);
      })
      .catch(() => {
        alert(`Session ID:\n${id}`);
      });
  };

  const openInviteModal = (whiteboard) => {
    setSelectedWhiteboard(whiteboard);
    setInviteModalOpen(true);
  };

  const filteredWhiteboards = useMemo(() => {
    const uid = session?.user?.id;
    if (!Array.isArray(whiteboards)) return [];
    if (filter === 'owned') return whiteboards.filter((wb) => wb.ownerId === uid);
    if (filter === 'shared')
      return whiteboards.filter(
        (wb) => Array.isArray(wb.members) && wb.members.some((m) => m.userId === uid && m.role !== 'owner')
      );
    return whiteboards;
  }, [whiteboards, filter, session?.user?.id]);

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      active: 'bg-blue-100 text-blue-700',
      collaborative: 'bg-green-100 text-green-700',
      shared: 'bg-purple-100 text-purple-700',
      archived: 'bg-yellow-100 text-yellow-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {status}
      </span>
    );
  };

  const formatDate = (val) => {
    if (!val) return '';
    const date = new Date(val);
    const now = new Date();
    const ms = now - date;
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading whiteboards…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Whiteboards</h1>
            <p className="text-gray-600 mt-1">Create, share, and jump back in</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setJoinModalOpen(true)}
              className="btn bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white flex items-center gap-2"
            >
              <i className="fa-solid fa-right-to-bracket"></i>
              Join Session
            </button>
            <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary flex items-center gap-2">
              <i className="fa-solid fa-plus"></i>
              New Whiteboard
            </button>
          </div>
        </div>

        {/* filters */}
        <div className="flex gap-2 border-b">
          {['all', 'owned', 'shared'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 font-medium capitalize transition-colors ${
                filter === f ? 'text-primary border-b-2 border-primary' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* errors */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
      )}

      {/* grid */}
      {filteredWhiteboards.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
          <i className="fa-solid fa-chalkboard text-5xl text-gray-300 mb-4"></i>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No whiteboards yet</h3>
          <p className="text-gray-500 mb-4">Create one or join with a session ID</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
              <i className="fa-solid fa-plus mr-2"></i>
              Create Whiteboard
            </button>
            <button
              onClick={() => setJoinModalOpen(true)}
              className="btn bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white"
            >
              <i className="fa-solid fa-right-to-bracket mr-2"></i>
              Join Session
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWhiteboards.map((wb) => (
            <div
              key={wb._id}
              className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* preview */}
              <div
                onClick={() => openWhiteboard(wb._id)}
                className="h-48 bg-gradient-to-br from-cream to-light-blue cursor-pointer flex items-center justify-center relative group"
              >
                <i className="fa-solid fa-chalkboard text-6xl text-primary opacity-20"></i>
                <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity"></div>
                {Array.isArray(wb.activeUsers) && wb.activeUsers.length > 0 && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    {wb.activeUsers.length} active
                  </div>
                )}
              </div>

              {/* info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3
                    onClick={() => openWhiteboard(wb._id)}
                    className="font-semibold text-gray-900 cursor-pointer hover:text-primary line-clamp-1"
                    title={wb.title}
                  >
                    {wb.title}
                  </h3>
                  {getStatusBadge(wb.status)}
                </div>

                <div className="text-sm text-gray-600 mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <i className="fa-solid fa-fingerprint text-xs"></i>
                    <span className="text-xs font-mono truncate" title={wb._id}>
                      {wb._id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <i className="fa-solid fa-clock text-xs"></i>
                    <span>{formatDate(wb.lastModified || wb.createdAt)}</span>
                  </div>
                </div>

                {/* members */}
                {Array.isArray(wb.members) && wb.members.length > 1 && (
                  <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <i className="fa-solid fa-users"></i>
                    <span>{wb.members.length} members</span>
                  </div>
                )}

                {/* actions */}
                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={() => openWhiteboard(wb._id)}
                    className="flex-1 py-2 px-3 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                  >
                    Open
                  </button>

                  {wb.ownerId === session?.user?.id && (
                    <button
                      onClick={() => openInviteModal(wb)}
                      className="py-2 px-3 border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                      title="Invite Collaborator"
                    >
                      <i className="fa-solid fa-user-plus"></i>
                    </button>
                  )}

                  <button
                    onClick={() => shareWhiteboard(wb._id)}
                    className="py-2 px-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    title="Share Session ID"
                  >
                    <i className="fa-solid fa-share-nodes text-gray-600"></i>
                  </button>

                  {wb.ownerId === session?.user?.id && (
                    <button
                      onClick={() => deleteWhiteboard(wb._id)}
                      className="py-2 px-3 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <i className="fa-solid fa-trash text-red-600"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* create */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create New Whiteboard</h2>
              <button onClick={() => setCreateModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Whiteboard Title</label>
              <input
                type="text"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createWhiteboard();
                }}
                placeholder="Enter a title..."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setCreateModalOpen(false)} className="flex-1 py-2 px-4 border rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={createWhiteboard} className="flex-1 py-2 px-4 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* join */}
      {joinModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Join Whiteboard Session</h2>
              <button onClick={() => setJoinModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Session ID</label>
              <input
                type="text"
                value={joinSessionId}
                onChange={(e) => setJoinSessionId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinWhiteboard();
                }}
                placeholder="Enter session ID..."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Ask the owner for the ID or check your invites.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setJoinModalOpen(false)} className="flex-1 py-2 px-4 border rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={joinWhiteboard} className="flex-1 py-2 px-4 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                Join
              </button>
            </div>
          </div>
        </div>
      )}

      {/* invite */}
      {inviteModalOpen && selectedWhiteboard && (
        <InviteModal
          whiteboard={selectedWhiteboard}
          session={session}
          onClose={() => {
            setInviteModalOpen(false);
            setSelectedWhiteboard(null);
          }}
          onSuccess={() => {
            fetchWhiteboards();
          }}
        />
      )}
    </div>
  );
}
