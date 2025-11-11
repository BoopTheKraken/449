
const getAPIUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    return ''; // relative URLs in production
  }

  // Development: use same host as frontend but port 4000
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
};

export const API_URL = getAPIUrl();

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
  register: (username, password, firstName, lastName, email, phoneNumber, displayName) =>
    apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, firstName, lastName, email, phoneNumber, displayName }),
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