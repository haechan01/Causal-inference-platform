import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Axios mock
//
// axios.create() returns the same mock object so that authAxios and the
// global axios share identical jest.fn() references in tests.
// ---------------------------------------------------------------------------

jest.mock('axios', () => {
  const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 1), eject: jest.fn() },
    },
    defaults: { baseURL: '' },
  } as any;
  mockAxios.create = jest.fn(() => mockAxios);
  return mockAxios;
});

// ---------------------------------------------------------------------------
// Test component
// ---------------------------------------------------------------------------

const TestConsumer: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, logout, register } = useAuth();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="username">{user?.username ?? 'none'}</span>
      <button
        data-testid="login-btn"
        onClick={() => login('test@example.com', 'TestPass123').catch(() => {})}
      >
        Login
      </button>
      <button data-testid="logout-btn" onClick={() => logout()}>
        Logout
      </button>
      <button
        data-testid="register-btn"
        onClick={() =>
          register('testuser', 'test@example.com', 'TestPass123').catch(() => {})
        }
      >
        Register
      </button>
    </div>
  );
};

/** Render and flush all pending effects / promises. */
const renderProvider = async () => {
  await act(async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
  });
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  (axios.get as jest.Mock).mockReset();
  (axios.post as jest.Mock).mockReset();
  localStorage.clear();

  // Default: /auth/me rejects with 401 (no active session)
  (axios.get as jest.Mock).mockRejectedValue({ response: { status: 401 } });
});

// ---------------------------------------------------------------------------
// Initial / loading state
// ---------------------------------------------------------------------------

describe('AuthProvider – initial state', () => {
  it('renders in a non-authenticated state when localStorage is empty', async () => {
    await renderProvider();

    expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
    expect(screen.getByTestId('username')).toHaveTextContent('none');
  });

  it('restores an authenticated session from localStorage', async () => {
    localStorage.setItem('accessToken', 'stored-access');
    localStorage.setItem('refreshToken', 'stored-refresh');
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: { user: { id: 1, username: 'alice', email: 'alice@test.com' } },
    });

    await renderProvider();

    expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
    expect(screen.getByTestId('username')).toHaveTextContent('alice');
  });

  it('clears storage and stays unauthenticated when the stored token is rejected', async () => {
    localStorage.setItem('accessToken', 'bad-token');
    localStorage.setItem('refreshToken', 'bad-refresh');
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('401 Unauthorized'));

    await renderProvider();

    expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useAuth hook guard
// ---------------------------------------------------------------------------

describe('useAuth hook', () => {
  it('throws when used outside an AuthProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------

describe('login()', () => {
  it('authenticates the user and persists tokens on success', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: {
        user: { id: 1, username: 'testuser', email: 'test@example.com' },
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      },
    });

    await renderProvider();

    act(() => { screen.getByTestId('login-btn').click(); });

    await waitFor(() =>
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes')
    );
    expect(screen.getByTestId('username')).toHaveTextContent('testuser');
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
  });

  it('remains unauthenticated when the API returns an error', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { error: 'Invalid email or password' } },
    });

    await renderProvider();

    act(() => { screen.getByTestId('login-btn').click(); });

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('ready')
    );
    expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------

describe('logout()', () => {
  it('clears user state and removes tokens from localStorage', async () => {
    localStorage.setItem('accessToken', 'valid-token');
    localStorage.setItem('refreshToken', 'valid-refresh');
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: { user: { id: 1, username: 'alice', email: 'alice@test.com' } },
    });

    await renderProvider();
    expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');

    act(() => { screen.getByTestId('logout-btn').click(); });

    await waitFor(() =>
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no')
    );
    expect(screen.getByTestId('username')).toHaveTextContent('none');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// register()
// ---------------------------------------------------------------------------

describe('register()', () => {
  it('authenticates the user and persists tokens on success', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: {
        user: { id: 2, username: 'newuser', email: 'new@example.com' },
        access_token: 'reg-access',
        refresh_token: 'reg-refresh',
      },
    });

    await renderProvider();

    act(() => { screen.getByTestId('register-btn').click(); });

    await waitFor(() =>
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes')
    );
    expect(localStorage.getItem('accessToken')).toBe('reg-access');
  });
});
