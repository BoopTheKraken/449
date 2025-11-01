import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext"; 

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);          // block submissions while pending

  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useAuth();

  // if user came from a protected route, keep intended destination
  const returnTo = new URLSearchParams(location.search).get("returnTo") || "/whiteboard";

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    // basic client validation; this will be replaced with real validation later
    if (password !== confirmPassword) {
      return setError("Passwords do not match");
    }
    if (password.length < 6) {
      return setError("Password must be at least 6 characters");
    }

    setLoading(true);

    try {
      // NOTE: mock signUp always rejects; this code path stays for when real auth lands
      const { data, error: signUpErr } = await signUp(email.trim(), password);
      if (signUpErr) {
        setError(signUpErr.message || "Registration failed");
        return;
      }
      // not hit in mock, but keep for shape parity
      if (data?.user) {
        // in real flow, likely navigate to login
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      } else {
        setError("Unexpected response. Try again.");
      }
    } catch (err) {
      // defensive about error shape
      const msg = err?.error?.message || err?.message || "Registration failed. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-beige to-light-blue flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <i className="fa-solid fa-user-plus text-3xl text-primary" aria-hidden="true"></i>
          </div>
          <h2 className="text-3xl font-bold text-gray-800">Create Account</h2>
          <p className="text-gray-600 mt-2">Join our collaborative whiteboard</p>
        </div>

        {/* Demo-only notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <i className="fa-solid fa-flask text-yellow-600 mt-0.5" aria-hidden="true"></i>
            <div>
              <p className="text-yellow-800 font-medium text-sm">Demo Mode Active</p>
              <p className="text-yellow-700 text-xs mt-1">
                Registration is disabled in the mock. Use the test accounts from the Login page.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-start gap-2"
          >
            <i className="fa-solid fa-exclamation-circle mt-0.5" aria-hidden="true"></i>
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Form is disabled in demo; keep structure for future enablement */}
        <form
          onSubmit={handleRegister}
          className="space-y-4 opacity-60 pointer-events-none"
          noValidate
          aria-disabled="true"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-envelope text-gray-400" aria-hidden="true"></i>
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                placeholder="your.email@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-gray-400" aria-hidden="true"></i>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-gray-400" aria-hidden="true"></i>
              </div>
              <input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled
            className="btn btn-primary w-full opacity-50 cursor-not-allowed"
            aria-busy={loading ? "true" : "false"}
          >
            <i className="fa-solid fa-user-plus mr-2" aria-hidden="true"></i>
            Sign Up (Disabled in Demo)
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Already have an account?{" "}
            <Link
              to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="text-primary hover:underline font-medium"
            >
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/*
TODO(Tatiana) - bunch of possibly/maybe
- Enable real registration: swap mock signUp with API; handle email verification and error codes (duplicate email, weak password).
- Password UX: add show/hide toggles and a strength meter; enforce minimum complexity server-side.
- Return path: preserve ?returnTo from protected route when linking back to login (done here).
- Field validation: run email format and password rules client-side before calling API; show field-level errors.
- Loading state: once enabled, remove pointer-events-none and wire disabled={loading}; add aria-live for errors.
- Analytics/Telemetry: log registration attempts (success/failure) with a lightweight client logger. - Maybe
- a11y: when errors show, move focus to the alert or first invalid field.
*/