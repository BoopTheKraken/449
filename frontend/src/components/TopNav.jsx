import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopNav({ onToggleSidebar }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  // keep logout simple; avoid leaving the UI in a weird state if signOut throws
  const handleLogout = async () => {
    try {
      // TODO(Tatiana): add a small loading state to disable this button during sign-out
      await signOut();
      navigate('/login'); // TODO(Tatiana): preserve returnTo path (last route) on redirect
    } catch (err) {
      // TODO(Tatiana): surface a non-blocking toast instead of alert when a toaster exists
      console.error('logout failed', err);
      alert('Logout failed. Try again.');
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-white/90 backdrop-blur shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* left: menu toggle + brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleSidebar?.()}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Toggle sidebar"
          >
            <i className="fa-solid fa-bars text-[18px]" aria-hidden="true"></i>
          </button>

          <Link to="/" className="flex items-center gap-2 font-semibold text-xl">
            <i className="fa-solid fa-palette text-primary" aria-hidden="true"></i>
            <span className="tracking-tight">WHITEBOARD</span>
          </Link>
        </div>

        {/* right: auth actions / nav */}
        <div className="flex items-center gap-3">
          {session ? (
            <>
              {/* user summary (truncate long emails) */}
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
                <i className="fa-solid fa-user-circle text-lg text-primary" aria-hidden="true"></i>
                <span className="max-w-[150px] truncate">
                  {session.user.displayName || session.user.email}
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                // TODO(Tatiana): aria-busy when adding loading state
              >
                <i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <nav className="flex items-center gap-2 text-sm">
              {/* keep About/Contact tucked on small screens */}
              <Link
                className="nav-link px-3 py-2 rounded-lg hover:bg-gray-100 hidden md:inline-block"
                to="/about"
              >
                About
              </Link>
              <Link
                className="nav-link px-3 py-2 rounded-lg hover:bg-gray-100 hidden md:inline-block"
                to="/contact"
              >
                Contact
              </Link>
              <Link
                className="nav-link px-3 py-2 rounded-lg hover:bg-gray-100"
                to="/login"
              >
                Login
              </Link>
              <Link
                className="btn-primary px-3 py-2 rounded-lg text-white"
                to="/register"
              >
                Sign Up
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}

/*
TODO(Tatiana)
- Auth redirect: when navigating to /login or /register from a protected route, keep ?returnTo=/previous/path and redirect after auth.
- Loading states: add a small spinner/aria-busy on logout to prevent double clicks (disable button while pending).
- Access control: hide brand link to "/" when already on "/"? not critical; optional polish.
- Keyboard a11y: ensure focus-visible styles are present globally; buttons/links already fine with Tailwind defaults.
- Telemetry: add a lightweight event log (e.g., console or pino) for toggleSidebar, logout success/failure.
*/