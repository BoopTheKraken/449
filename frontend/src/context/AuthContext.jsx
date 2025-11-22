import { createContext, useEffect, useState, useContext } from "react";
import { supabase } from "../config/supabaseClient";

const AuthContext = createContext(null);

// local mock users (fallback if Supabase is down)
const MOCK_USERS = [
  { id: "2ae7a48e-052c-484a-9931-d38ccb6a5e5c", email: "alice@test.com", password: "password1234", displayName: "Alice" },
  { id: "user-2", email: "bob@test.com", password: "password123", displayName: "Bob" },
];

const MOCK_LOGIN_DELAY_MS = 500;
const MOCK_SIGNOUT_DELAY_MS = 300;

export const AuthContextProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);
  const [supabaseError, setSupabaseError] = useState(null);

  // check Supabase once on load
  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("auth: supabase down, mock on", error?.message);
          setSupabaseError(error.message);
          setUseMock(true);

          const raw = localStorage.getItem("mock-user");
          if (raw) {
            try {
              setSession({ user: JSON.parse(raw) });
            } catch (e) {
              console.error("auth: bad mock-user", e);
              localStorage.removeItem("mock-user");
            }
          }
        } else {
          setUseMock(false);
          setSupabaseError(null);
          if (data?.session) {
            setSession(data.session);
            localStorage.removeItem("mock-user");
          } else {
            setSession(null);
          }
        }
      } catch (e) {
        console.error("auth: supabase connect fail, mock on", e);
        setSupabaseError(e.message);
        setUseMock(true);

        const raw = localStorage.getItem("mock-user");
        if (raw) {
          try {
            setSession({ user: JSON.parse(raw) });
          } catch (e2) {
            console.error("auth: bad mock-user", e2);
            localStorage.removeItem("mock-user");
          }
        }
      } finally {
        setLoading(false);
      }
    };

    init();

    // keep session in sync when not mocking
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!useMock) setSession(s);
    });

    return () => sub.subscription?.unsubscribe?.();
  }, [useMock]);

  // Helper function for mock login (bug found and fix suggested by ChatGPT)
  // fixes infinite login loop when Supabase fails
  const mockSignIn = (email, password) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const user = MOCK_USERS.find((u) => u.email === email && u.password === password);
        if (!user) {
          return reject({ data: null, error: { message: "Invalid email or password" } });
        }
        const s = { user: { id: user.id, email: user.email, displayName: user.displayName } };
        setSession(s);
        localStorage.setItem("mock-user", JSON.stringify(s.user));
        resolve({ data: s, error: null });
      }, MOCK_LOGIN_DELAY_MS);
    });
  };

  // sign in
  const signIn = async (email, password) => {
    if (useMock) {
      return mockSignIn(email, password);
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.warn("auth: login fail, switching to mock", error.message);
        setUseMock(true);
        setSupabaseError(error.message);
        return mockSignIn(email, password);
      }
      localStorage.removeItem("mock-user");
      return { data, error: null };
    } catch (e) {
      console.error("auth: signIn error, switching to mock", e);
      setUseMock(true);
      setSupabaseError(e.message);
      return mockSignIn(email, password);
    }
  };

  // sign up
  const signUp = async (username, password, firstName, lastName, email, phoneNumber, displayName) => {
    if (useMock) {
      return new Promise((_, reject) => {
        setTimeout(() => {
          const exists = MOCK_USERS.some((u) => u.email === email);
          if (exists) {
            return reject({ data: null, error: { message: "User already exists. Please login." } });
          }
          reject({
            data: null,
            error: { message: "Registration disabled in mock mode. Use alice@test.com or bob@test.com (password: password123)" },
          });
        }, MOCK_LOGIN_DELAY_MS);
      });
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username,
            firstName: firstName,
            lastName: lastName,
            phoneNumber: phoneNumber
          }
        }
        //options: { data: { display_name: displayName } }
      });
      if (error) {
        console.warn("auth: signup fail", error.message);
        setUseMock(true);
        setSupabaseError(error.message);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (e) {
      console.error("auth: signUp error", e);
      setUseMock(true);
      setSupabaseError(e.message);
      return { data: null, error: { message: e.message } };
    }
  };

  // sign out
  const signOut = async () => {
    if (useMock) {
      return new Promise((resolve) => {
        setTimeout(() => {
          setSession(null);
          localStorage.removeItem("mock-user");
          resolve({ error: null });
        }, MOCK_SIGNOUT_DELAY_MS);
      });
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn("auth: signout warn", error.message);
      setSession(null);
      localStorage.removeItem("mock-user");
      return { error: null };
    } catch (e) {
      console.error("auth: signout error", e);
      setSession(null);
      return { error: null };
    }
  };

  const value = { session, loading, useMock, supabaseError, signIn, signUp, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthContextProvider");
  return ctx;
};
