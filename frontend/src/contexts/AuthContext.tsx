// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';

// API base URL - use REACT_APP_API_URL in production, fallback to localhost for dev
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Create a separate axios instance for auth requests without interceptors
const authAxios = axios.create({
  baseURL: API_BASE_URL
});

// Define the shape of our user data
interface User {
  id: number;
  username: string;
  email: string;
}

// Define the shape of our authentication context
interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
}

// Create the context with default values
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Configure axios defaults
axios.defaults.baseURL = API_BASE_URL;

// Create the AuthProvider component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State variables to track authentication status
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated
  const isAuthenticated = !!user && !!accessToken;

  // Logout function
  const logout = useCallback((): void => {
    // Clear localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    
    // Clear state
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  // Refresh access token function
  const refreshAccessToken = useCallback(async (): Promise<void> => {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await authAxios.post('/auth/refresh', {}, {
        headers: { Authorization: `Bearer ${refreshToken}` }
      });

      const { access_token } = response.data;
      
      // Update stored token
      localStorage.setItem('accessToken', access_token);
      setAccessToken(access_token);
      
    } catch (error) {
      // Refresh failed, logout user
      logout();
      throw error;
    }
  }, [refreshToken, logout]);

  // Function to set up axios interceptors for automatic token refresh
  useEffect(() => {
    // Request interceptor - adds token to all requests except auth endpoints
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        // Don't add token to auth endpoints (login, register, refresh)
        const authEndpoints = ['/auth/login', '/auth/register', '/auth/refresh'];
        const url = config.url || '';
        const isAuthEndpoint = authEndpoints.some(endpoint => 
          url.includes(endpoint) || url.endsWith(endpoint)
        );
        
        // For auth endpoints, explicitly ensure no Authorization header
        if (isAuthEndpoint) {
          delete config.headers.Authorization;
          delete config.headers.authorization;
          return config;
        }
        
        // Only add token if we have one and it's not an auth endpoint
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handles token refresh on 401 errors
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            await refreshAccessToken();
            // Get the fresh token from localStorage (not the stale closure variable)
            const freshToken = localStorage.getItem('accessToken');
            if (freshToken) {
              originalRequest.headers.Authorization = `Bearer ${freshToken}`;
              return axios(originalRequest);
            } else {
              throw new Error('No fresh token available');
            }
          } catch (refreshError) {
            // Refresh failed, logout user
            logout();
            return Promise.reject(refreshError);
          }
        }
        
        return Promise.reject(error);
      }
    );

    // Cleanup interceptors when component unmounts
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [accessToken, refreshAccessToken, logout]);

  // Load authentication state from localStorage on app start
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const storedAccessToken = localStorage.getItem('accessToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        
        if (storedAccessToken && storedRefreshToken) {
          setAccessToken(storedAccessToken);
          setRefreshToken(storedRefreshToken);
          
          // Verify token is still valid by getting user info
          const response = await axios.get('/auth/me', {
            headers: { Authorization: `Bearer ${storedAccessToken}` }
          });
          
          setUser(response.data.user);
        }
      } catch (error) {
        // Token is invalid, clear storage
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthState();
  }, []);

  // Login function
  const login = async (email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Clear any existing tokens before login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAccessToken(null);
      setRefreshToken(null);
      

      const response = await authAxios.post('/auth/login', {
        email,
        password
      });

      const { user: userData, access_token, refresh_token } = response.data;
      
      // Store tokens in localStorage
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', refresh_token);
      
      // Update state
      setUser(userData);
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Register function
  const register = async (username: string, email: string, password: string): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Clear any existing tokens before registration
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAccessToken(null);
      setRefreshToken(null);
      
      const response = await authAxios.post('/auth/register', {
        username,
        email,
        password
      });

      const { user: userData, access_token, refresh_token } = response.data;
      
      // Store tokens in localStorage
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', refresh_token);
      
      // Update state
      setUser(userData);
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Registration failed';
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Create the context value
  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshAccessToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
