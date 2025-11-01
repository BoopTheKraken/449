const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const getToken = () => localStorage.getItem('auth-token');

async function apiCall(endpoint, options = {}) {
  const token = getToken();
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

export const auth = {
  register: (email, password, displayName) =>
    apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email, password) =>
    apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => apiCall('/api/auth/me'),
};

export const whiteboards = {
  getAll: () => apiCall('/api/whiteboards'),
  
  create: (title) =>
    apiCall('/api/whiteboards', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
};