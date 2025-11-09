import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../utils/api';
const linkBase = "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors";

export default function SideNav({ onNavigate }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [invitationCount, setInvitationCount] = useState(0);

  // Fetch pending invitations count
  useEffect(() => {
    if (session) {
      fetchInvitationCount();
      // Refresh count every 30 seconds
      const interval = setInterval(fetchInvitationCount, 30000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const fetchInvitationCount = async () => {
    try {
      const token = session?.access_token;
      const response = await fetch(`${API_URL}/api/invitations?status=pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvitationCount(data.invitations?.length || 0);
      }
    } catch (error) {
      console.error('Failed to fetch invitation count:', error);
    }
  };

  return (
    <aside className="h-full w-64 shrink-0 border-r bg-white p-3 overflow-y-auto">
      {/* Header */}
      <div className="mb-4 rounded-2xl bg-beige p-4">
        <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">
          Navigation
        </p>
      </div>

      {/* Main Navigation */}
      <div className="space-y-1 mb-6">
        <NavLink 
          to="/" 
          end
          className={({ isActive }) => `${linkBase} ${isActive ? 'nav-active' : 'nav-link text-gray-700 hover:bg-beige'}`}
          onClick={() => onNavigate?.()}
        >
          <i className="fa-solid fa-house text-[16px]" aria-hidden="true"></i>
          Home
        </NavLink>

        {session && (
          <>
            <NavLink 
              to="/dashboard" 
              end
              className={({ isActive }) => `${linkBase} ${isActive ? 'nav-active' : 'nav-link text-gray-700 hover:bg-beige'}`}
              onClick={() => onNavigate?.()}
            >
              <i className="fa-solid fa-table-columns text-[16px]" aria-hidden="true"></i>
              Dashboard
            </NavLink>

            <NavLink 
              to="/invitations" 
              end
              className={({ isActive }) => `${linkBase} relative ${isActive ? 'nav-active' : 'nav-link text-gray-700 hover:bg-beige'}`}
              onClick={() => onNavigate?.()}
            >
              <i className="fa-solid fa-envelope text-[16px]" aria-hidden="true"></i>
              Invitations
              {invitationCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {invitationCount > 9 ? '9+' : invitationCount}
                </span>
              )}
            </NavLink>

            <NavLink 
              to="/whiteboard" 
              end
              className={({ isActive }) => `${linkBase} ${isActive ? 'nav-active' : 'nav-link text-gray-700 hover:bg-beige'}`}
              onClick={() => onNavigate?.()}
            >
              <i className="fa-solid fa-chalkboard text-[16px]" aria-hidden="true"></i>
              Whiteboard
            </NavLink>
          </>
        )}

        <NavLink 
          to="/about" 
          end
          className={({ isActive }) => `${linkBase} ${isActive ? 'nav-active' : 'nav-link text-gray-700 hover:bg-beige'}`}
          onClick={() => onNavigate?.()}
        >
          <i className="fa-solid fa-circle-info text-[16px]" aria-hidden="true"></i>
          About
        </NavLink>

        <NavLink 
          to="/contact" 
          end
          className={({ isActive }) => `${linkBase} ${isActive ? 'nav-active' : 'nav-link text-gray-700 hover:bg-beige'}`}
          onClick={() => onNavigate?.()}
        >
          <i className="fa-solid fa-envelope text-[16px]" aria-hidden="true"></i>
          Contact
        </NavLink>
      </div>

      {/* Divider */}
      <div className="my-4 border-t border-gray-200"></div>

      {/* Quick Actions */}
      {session && (
        <div className="space-y-1 mb-6">
          <div className="mb-2 px-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
              Quick Actions
            </p>
          </div>

          <button
            onClick={() => {
              navigate('/dashboard');
              onNavigate?.();
            }}
            className={`${linkBase} w-full text-gray-700 hover:bg-beige justify-start`}
          >
            <i className="fa-solid fa-plus text-[16px]" aria-hidden="true"></i>
            New Board
          </button>

          <button
            onClick={() => {
              navigate('/dashboard');
              onNavigate?.();
            }}
            className={`${linkBase} w-full text-gray-700 hover:bg-beige justify-start`}
          >
            <i className="fa-solid fa-clock-rotate-left text-[16px]" aria-hidden="true"></i>
            Recent Boards
          </button>
        </div>
      )}

      {/* Auth Section (when not logged in) */}
      {!session && (
        <div className="space-y-2">
          <div className="mb-2 px-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
              Get Started
            </p>
          </div>
          
          <NavLink
            to="/login"
            className={`${linkBase} text-gray-700 hover:bg-beige`}
            onClick={() => onNavigate?.()}
          >
            <i className="fa-solid fa-right-to-bracket text-[16px]" aria-hidden="true"></i>
            Login
          </NavLink>

          <NavLink
            to="/register"
            className={`${linkBase} bg-primary text-white hover:opacity-90`}
            onClick={() => onNavigate?.()}
          >
            <i className="fa-solid fa-user-plus text-[16px]" aria-hidden="true"></i>
            Sign Up
          </NavLink>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="rounded-xl bg-beige p-3">
          <div className="text-xs text-gray-600 text-center">
            <p className="font-semibold">CPSC449 Project</p>
            <p className="text-gray-500 mt-1">Whiteboard v1.0</p>
          </div>
        </div>

        {/* GitHub Link */}
        <a
          href="https://github.com/BoopTheKraken/449/branches"
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkBase} text-gray-700 hover:bg-beige mt-2`}
          onClick={() => onNavigate?.()}
        >
          <i className="fa-brands fa-github text-[16px]" aria-hidden="true"></i>
          <span>GitHub</span>
          <i className="fa-solid fa-up-right-from-square text-xs ml-auto text-gray-400" aria-hidden="true"></i>
        </a>
      </div>
    </aside>
  );
}