import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Loader, CheckCircle, XCircle } from 'lucide-react';
import { z } from 'zod';
import './Login.css';

const registerSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters").max(30, "Username must be at most 30 characters"),
  password: z.string()
    .min(4, "Password must be at least 4 characters")
    .regex(/[A-Z]/, "Password needs an uppercase letter")
    .regex(/[0-9]/, "Password needs a number")
    .regex(/[^A-Za-z0-9]/, "Password needs a special character")
});

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [usernameError, setUsernameError] = useState('');
  
  const navigate = useNavigate();

  // Load remembered username
  useEffect(() => {
    const savedUsername = localStorage.getItem('rememberedUsername');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  // Validate username
  useEffect(() => {
    if (!isLogin && username.length > 0) {
      const res = registerSchema.safeParse({ username, password: 'Valid1!' });
      if (!res.success) {
        const userErr = res.error.errors.find(e => e.path[0] === 'username');
        if (userErr) {
          setUsernameError(userErr.message);
        } else {
          setUsernameError('');
        }
      } else {
        setUsernameError('');
      }
    } else {
      setUsernameError('');
    }
  }, [username, isLogin]);

  // Validate password strength
  useEffect(() => {
    if (isLogin) {
      setPasswordStrength(0);
      return;
    }
    
    let strength = 0;
    if (password.length > 5) strength += 1;
    if (password.length > 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    
    setPasswordStrength(Math.min(strength, 4));
  }, [password, isLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const schema = isLogin ? loginSchema : registerSchema;
    const validation = schema.safeParse({ username, password });
    
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);

    const endpoint = isLogin ? '/api/login' : '/api/register';
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (isLogin) {
        if (rememberMe) {
          localStorage.setItem('rememberedUsername', username);
        } else {
          localStorage.removeItem('rememberedUsername');
        }
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('avatarUrl', data.avatarUrl || '');
        navigate('/chat');
      } else {
        setIsLogin(true);
        setPassword('');
        setError('Registration successful! Please login.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStrengthLabel = () => {
    if (passwordStrength === 0) return 'Very Weak';
    if (passwordStrength === 1) return 'Weak';
    if (passwordStrength === 2) return 'Fair';
    if (passwordStrength === 3) return 'Good';
    return 'Strong';
  };

  const getStrengthColor = () => {
    if (passwordStrength === 0) return 'var(--color-danger)';
    if (passwordStrength === 1) return 'var(--color-danger)';
    if (passwordStrength === 2) return 'var(--color-warning)';
    if (passwordStrength === 3) return 'var(--color-success)';
    return 'var(--color-success)';
  };

  return (
    <div className="login-container flex-center">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>

      <div className="glass-panel login-box">
        <div className="login-header">
          <MessageSquare size={48} className="logo-icon animated-logo" />
          <h1 className="text-gradient animated-gradient-text">Nexus Chat</h1>
          <p className="subtitle">{isLogin ? 'Welcome back, explorer' : 'Join the conversation'}</p>
        </div>

        {error && <div className={`alert ${error.includes('successful') ? 'alert-success' : 'alert-error'}`}>{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Username</label>
            <div className="input-wrapper">
              <input 
                type="text" 
                className={`input-field ${usernameError ? 'input-error' : ''}`} 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required 
              />
              {!isLogin && username.length > 0 && !usernameError && (
                <CheckCircle className="input-icon-right success-icon" size={18} />
              )}
              {!isLogin && usernameError && (
                <XCircle className="input-icon-right error-icon" size={18} />
              )}
            </div>
            {usernameError && <span className="validation-text error-text">{usernameError}</span>}
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required 
            />
            
            {!isLogin && password.length > 0 && (
              <div className="password-strength-container">
                <div className="password-strength-bar">
                  <div 
                    className="password-strength-fill" 
                    style={{ 
                      width: `${(passwordStrength / 4) * 100}%`,
                      backgroundColor: getStrengthColor()
                    }}
                  ></div>
                </div>
                <span className="strength-label" style={{ color: getStrengthColor() }}>
                  {getStrengthLabel()}
                </span>
              </div>
            )}
          </div>

          {isLogin && (
            <div className="form-group-checkbox">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="checkbox-custom"></span>
                Remember me
              </label>
            </div>
          )}

          <button type="submit" className="btn-primary login-btn" disabled={loading || (!isLogin && usernameError)}>
            {loading ? (
              <span className="btn-content-loading">
                <Loader className="spinner" size={20} /> Processing...
              </span>
            ) : (
              isLogin ? 'Sign In' : 'Sign Up'
            )}
          </button>
        </form>

        <div className="toggle-mode">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="text-btn" onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setUsernameError(''); }}>
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
