'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { User } from '@/lib/types';

interface LoginFormProps {
  onLoginSuccess: (user: User) => void;
}

export default function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    const result = await login(username, password);
    if (result) {
      setUsername('');
      setPassword('');
      onLoginSuccess(result);
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div id="loginView" style={{ display: 'flex' }}>
      <div className="login-container">
        <div className="login-header">
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>▶</div>
          <h1>Ingesta</h1>
          <p>Sign in to your account</p>
        </div>

        {error && <div className="login-error show">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '16px' }}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
