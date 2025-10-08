# Secure Token Storage Guide

## Overview

This guide explains how to securely store and manage JWT tokens in your React frontend application.

## Token Storage Strategies

### ⚠️ Security Comparison

| Storage Method | Access Token | Refresh Token | Security Level |
|---------------|--------------|---------------|----------------|
| **Memory (React State)** | ✅ Recommended | ❌ Not persistent | High |
| **localStorage** | ⚠️ OK for dev | ❌ XSS vulnerable | Low |
| **sessionStorage** | ⚠️ Better than localStorage | ❌ XSS vulnerable | Medium |
| **httpOnly Cookie** | ❌ CSRF risk | ✅ Recommended | High |
| **Secure + httpOnly Cookie** | ❌ CSRF risk | ✅ Best option | Very High |

### 🎯 Recommended Approach

**Best Practice:**
- **Access tokens**: Store in **memory** (React state/context)
- **Refresh tokens**: Store in **httpOnly cookies** (set by backend)

## Implementation

### Option 1: Memory Storage (Recommended for Access Tokens)

Create an authentication context to store tokens in memory:

```typescript
// src/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect } from 'react';

interface AuthContextType {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important for cookies
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) throw new Error('Login failed');

      const data = await response.json();
      setAccessToken(data.access_token);
      // Refresh token is automatically stored in httpOnly cookie by backend
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await fetch('http://localhost:5000/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAccessToken(null);
    }
  };

  const refreshToken = async (): Promise<string | null> => {
    try {
      const response = await fetch('http://localhost:5000/api/auth/refresh', {
        method: 'POST',
        credentials: 'include' // Sends httpOnly cookie automatically
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const data = await response.json();
      setAccessToken(data.access_token);
      return data.access_token;
    } catch (error) {
      console.error('Token refresh error:', error);
      setAccessToken(null);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ accessToken, setAccessToken, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### Using the Auth Context

```typescript
// src/App.tsx
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      {/* Your app components */}
    </AuthProvider>
  );
}
```

```typescript
// src/components/LoginForm.tsx
import { useAuth } from '../contexts/AuthContext';

const LoginForm = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      // Redirect to dashboard
    } catch (error) {
      alert('Login failed');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)} 
        placeholder="Email"
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)} 
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
};
```

### Option 2: Axios Interceptor with Auto Token Refresh

```typescript
// src/utils/axiosInstance.ts
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true // Important for cookies
});

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

// Request interceptor - add token to requests
axiosInstance.interceptors.request.use(
  (config) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token expiration
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If token expired and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const response = await axios.post(
          `${API_BASE_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = response.data.access_token;
        setAccessToken(newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
```

### Using Axios Instance

```typescript
// src/components/Dashboard.tsx
import { useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';

const Dashboard = () => {
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await axiosInstance.get('/api/auth/me');
        setUserData(response.data.user);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };

    fetchUserData();
  }, []);

  return (
    <div>
      {userData ? (
        <h1>Welcome, {userData.username}!</h1>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};
```

## Option 3: localStorage (Simple but Less Secure)

⚠️ **Warning:** Use only for development or non-sensitive applications

```typescript
// src/utils/auth.ts
export const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
};

export const getAccessToken = (): string | null => {
  return localStorage.getItem('access_token');
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem('refresh_token');
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

export const isAuthenticated = (): boolean => {
  return !!getAccessToken();
};
```

## Protected Routes

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
```

```typescript
// src/App.tsx usage
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
```

## Security Checklist

- ✅ Store access tokens in memory (React state)
- ✅ Store refresh tokens in httpOnly cookies (if backend supports)
- ✅ Use HTTPS in production
- ✅ Set short expiration for access tokens (1 hour)
- ✅ Implement automatic token refresh
- ✅ Clear tokens on logout
- ✅ Validate tokens on protected routes
- ❌ Never log tokens to console in production
- ❌ Never store tokens in URL parameters
- ❌ Never send tokens over unsecured connections

## Common Pitfalls

### ❌ DON'T: Store sensitive tokens in localStorage for production
```javascript
localStorage.setItem('refresh_token', token); // XSS vulnerable
```

### ✅ DO: Store in memory or httpOnly cookies
```javascript
const [accessToken, setAccessToken] = useState(null); // Safe from XSS
```

### ❌ DON'T: Expose tokens in console.log
```javascript
console.log('Token:', accessToken); // Never do this!
```

### ✅ DO: Use secure logging in development only
```javascript
if (process.env.NODE_ENV === 'development') {
  console.log('Auth success');
}
```

## Testing Token Storage

```typescript
// src/utils/auth.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../contexts/AuthContext';

describe('Authentication', () => {
  it('should store access token in memory', async () => {
    const { result } = renderHook(() => useAuth());
    
    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });
    
    expect(result.current.accessToken).toBeTruthy();
    expect(localStorage.getItem('access_token')).toBeNull(); // Not in localStorage
  });

  it('should clear token on logout', async () => {
    const { result } = renderHook(() => useAuth());
    
    await act(async () => {
      await result.current.login('test@example.com', 'password');
      await result.current.logout();
    });
    
    expect(result.current.accessToken).toBeNull();
  });
});
```

## Additional Resources

- [OWASP JWT Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [JWT.io - Token Debugger](https://jwt.io)
- [React Security Best Practices](https://react.dev/learn/keeping-components-pure#side-effects-unintended-consequences)

