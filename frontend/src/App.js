import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContextProvider, useAuth } from './context/AuthContext'; // Using Supabase auth
import Layout from './components/Layout';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Register from './pages/Register';
import Login from './pages/Login';
import Whiteboard from './pages/Whiteboard';
import Dashboard from './pages/Dashboard';
import Invitations from './pages/Invitations';
import InviteAccept from './pages/InviteAccept';

import './index.css';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes WITHOUT sidebar layout */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Public invitation accept page (no layout) */}
          <Route path="/invite/:token" element={<InviteAccept />} />
          
          {/* Routes WITH sidebar layout */}
          <Route element={<Layout />}>
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/invitations" 
              element={
                <ProtectedRoute>
                  <Invitations />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/whiteboard" 
              element={
                <ProtectedRoute>
                  <Whiteboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/whiteboard/:id" 
              element={
                <ProtectedRoute>
                  <Whiteboard />
                </ProtectedRoute>
              } 
            />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}

export default App;