import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Loader, CheckCircle, XCircle, Phone, Mail, KeyRound, ChevronLeft, ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '../supabase';
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
  const [authMethod, setAuthMethod] = useState('password');
  const [isLogin, setIsLogin] = useState(true);

  // Password state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);

  // OTP state
  const [otpValue, setOtpValue] = useState('');
  const [otpDisplayName, setOtpDisplayName] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const otpInputRefs = useRef([]);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Load remembered username
  useEffect(() => {
    const saved = localStorage.getItem('rememberedUsername');
    if (saved) { setUsername(saved); setRememberMe(true); }
  }, []);

  // Handle Supabase OAuth redirect (Google login returns here)
  useEffect(() => {
    const handleOAuthRedirect = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) return;

      const user = session.user;
      if (!user) return;

      // Exchange Supabase session for our app JWT
      try {
        const res = await fetch(`${API_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleId: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.user_metadata?.name
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('avatarUrl', data.avatarUrl || '');
        navigate('/chat');
      } catch (err) {
        setError('Google login failed: ' + err.message);
      }
    };
    handleOAuthRedirect();
  }, []);

  // Username validation
  useEffect(() => {
    if (!isLogin && username.length > 0) {
      const res = registerSchema.safeParse({ username, password: 'Valid1!' });
      if (!res.success) {
        const err = res.error.errors.find(e => e.path[0] === 'username');
        setUsernameError(err ? err.message : '');
      } else setUsernameError('');
    } else setUsernameError('');
  }, [username, isLogin]);

  // Password strength
  useEffect(() => {
    if (isLogin) { setPasswordStrength(0); return; }
    let s = 0;
    if (password.length > 5) s++;
    if (password.length > 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    setPasswordStrength(Math.min(s, 4));
  }, [password, isLogin]);

  // OTP countdown
  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const t = setInterval(() => setOtpResendTimer(p => p - 1), 1000);
    return () => clearInterval(t);
  }, [otpResendTimer]);

  const switchMethod = (method) => {
    setAuthMethod(method);
    setError(''); setSuccessMsg('');
    setOtpSent(false);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpValue(''); setOtpDisplayName('');
  };

  // ── Password submit ──────────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const schema = isLogin ? loginSchema : registerSchema;
    const validation = schema.safeParse({ username, password });
    if (!validation.success) { setError(validation.error.errors[0].message); return; }
    setLoading(true);
    const endpoint = isLogin ? '/api/login' : '/api/register';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      if (isLogin) {
        if (rememberMe) localStorage.setItem('rememberedUsername', username);
        else localStorage.removeItem('rememberedUsername');
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('avatarUrl', data.avatarUrl || '');
        navigate('/chat');
      } else {
        setIsLogin(true);
        setPassword('');
        setSuccessMsg('Registration successful! Please login.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Send OTP via Supabase ────────────────────────────────────
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setError(''); setSuccessMsg('');
    const type = authMethod === 'email-otp' ? 'email' : 'phone';
    if (!otpValue.trim()) { setError(`Please enter your ${type}`); return; }

    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpValue)) {
      setError('Please enter a valid email address'); return;
    }
    if (type === 'phone' && !/^\+?[0-9]{8,15}$/.test(otpValue.replace(/\s/g, ''))) {
      setError('Please enter a valid phone number with country code (e.g. +919876543210)'); return;
    }

    setLoading(true);
    try {
      let sbError;
      if (type === 'email') {
        const { error } = await supabase.auth.signInWithOtp({ email: otpValue.trim() });
        sbError = error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          phone: otpValue.trim().replace(/\s/g, '')
        });
        sbError = error;
      }

      if (sbError) throw new Error(sbError.message);

      setOtpSent(true);
      setOtpResendTimer(60);
      setSuccessMsg(type === 'email'
        ? `OTP sent to ${otpValue}! Check your inbox (and spam folder).`
        : `OTP sent to ${otpValue}!`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError('Failed to send OTP: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP digit handlers ───────────────────────────────────────
  const handleOtpDigit = (idx, val) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...otpDigits];
    next[idx] = val;
    setOtpDigits(next);
    if (val && idx < 5) otpInputRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpInputRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...otpDigits];
    for (let i = 0; i < 6; i++) next[i] = paste[i] || '';
    setOtpDigits(next);
    otpInputRefs.current[Math.min(paste.length, 5)]?.focus();
  };

  // ── Verify OTP via Supabase ──────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    const otp = otpDigits.join('');
    if (otp.length !== 6) { setError('Please enter the 6-digit OTP'); return; }
    setLoading(true);
    const type = authMethod === 'email-otp' ? 'email' : 'phone';

    try {
      let session;
      if (type === 'email') {
        const { data, error } = await supabase.auth.verifyOtp({
          email: otpValue.trim(),
          token: otp,
          type: 'email'
        });
        if (error) throw new Error(error.message);
        session = data.session;
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: otpValue.trim().replace(/\s/g, ''),
          token: otp,
          type: 'sms'
        });
        if (error) throw new Error(error.message);
        session = data.session;
      }

      if (!session) throw new Error('No session returned after OTP verification');

      // Exchange Supabase session for our app JWT
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          value: otpValue.trim(),
          otp,
          username: otpDisplayName.trim(),
          supabaseUserId: session.user.id
        })
      });
      const appData = await res.json();
      if (!res.ok) throw new Error(appData.error || 'Login failed');

      localStorage.setItem('token', appData.token);
      localStorage.setItem('username', appData.username);
      localStorage.setItem('avatarUrl', appData.avatarUrl || '');
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Google Sign-In via Supabase ──────────────────────────────
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login'
        }
      });
      if (error) throw new Error(error.message);
      // Redirect happens automatically — the useEffect above handles the return
    } catch (err) {
      setError('Google sign-in failed: ' + err.message);
      setGoogleLoading(false);
    }
  };

  const getStrengthLabel = () => ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength];
  const getStrengthColor = () => passwordStrength <= 1 ? 'var(--color-danger)' : passwordStrength === 2 ? 'var(--color-warning)' : 'var(--color-success)';

  const isSupabaseConfigured = import.meta.env.VITE_SUPABASE_ANON_KEY &&
    import.meta.env.VITE_SUPABASE_ANON_KEY !== 'your_anon_public_key_here';

  return (
    <div className="login-container flex-center">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="glass-panel login-box">
        <div className="login-header">
          <MessageSquare size={48} className="logo-icon animated-logo" />
          <h1 className="text-gradient animated-gradient-text">Nexus Chat</h1>
          <p className="subtitle">
            {authMethod === 'password'
              ? (isLogin ? 'Welcome back, explorer' : 'Join the conversation')
              : authMethod === 'email-otp' ? 'Sign in with Email OTP'
              : 'Sign in with Phone OTP'}
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {/* ── Method Tabs ── */}
        <div className="auth-method-tabs">
          <button className={`method-tab ${authMethod === 'password' ? 'active' : ''}`} onClick={() => switchMethod('password')} type="button">
            <KeyRound size={15} /> Password
          </button>
          <button className={`method-tab ${authMethod === 'email-otp' ? 'active' : ''}`} onClick={() => switchMethod('email-otp')} type="button">
            <Mail size={15} /> Email OTP
          </button>
          <button className={`method-tab ${authMethod === 'phone-otp' ? 'active' : ''}`} onClick={() => switchMethod('phone-otp')} type="button">
            <Phone size={15} /> Phone OTP
          </button>
        </div>

        {/* ══ PASSWORD ════════════════════════════════════════ */}
        {authMethod === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="login-form">
            <div className="form-group">
              <label>Username</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  className={`input-field ${usernameError ? 'input-error' : ''}`}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                />
                {!isLogin && username.length > 0 && !usernameError && <CheckCircle className="input-icon-right success-icon" size={18} />}
                {!isLogin && usernameError && <XCircle className="input-icon-right error-icon" size={18} />}
              </div>
              {usernameError && <span className="validation-text error-text">{usernameError}</span>}
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              {!isLogin && password.length > 0 && (
                <div className="password-strength-container">
                  <div className="password-strength-bar">
                    <div className="password-strength-fill" style={{ width: `${(passwordStrength / 4) * 100}%`, backgroundColor: getStrengthColor() }} />
                  </div>
                  <span className="strength-label" style={{ color: getStrengthColor() }}>{getStrengthLabel()}</span>
                </div>
              )}
            </div>

            {isLogin && (
              <div className="form-group-checkbox">
                <label className="checkbox-label">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  <span className="checkbox-custom" />
                  Remember me
                </label>
              </div>
            )}

            <button type="submit" className="btn-primary login-btn" disabled={loading || (!isLogin && !!usernameError)}>
              {loading
                ? <span className="btn-content-loading"><Loader className="spinner" size={20} /> Processing...</span>
                : isLogin ? 'Sign In' : 'Sign Up'}
            </button>

            <div className="toggle-mode">
              <p>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button type="button" className="text-btn" onClick={() => { setIsLogin(!isLogin); setError(''); setSuccessMsg(''); setPassword(''); setUsernameError(''); }}>
                  {isLogin ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ══ EMAIL OTP / PHONE OTP ════════════════════════════ */}
        {(authMethod === 'email-otp' || authMethod === 'phone-otp') && (
          <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="login-form">
            {!otpSent ? (
              <>
                <div className="form-group">
                  <label>{authMethod === 'email-otp' ? 'Email Address' : 'Phone Number'}</label>
                  <div className="input-wrapper">
                    {authMethod === 'email-otp'
                      ? <Mail size={16} className="input-icon-left" />
                      : <Phone size={16} className="input-icon-left" />}
                    <input
                      type={authMethod === 'email-otp' ? 'email' : 'tel'}
                      className="input-field input-with-icon"
                      value={otpValue}
                      onChange={e => setOtpValue(e.target.value)}
                      placeholder={authMethod === 'email-otp' ? 'you@example.com' : '+91 9876543210'}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Display Name <span className="optional-label">(optional — for new accounts)</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={otpDisplayName}
                    onChange={e => setOtpDisplayName(e.target.value)}
                    placeholder="What should we call you?"
                    maxLength={30}
                  />
                </div>

                {!isSupabaseConfigured && (
                  <div className="supabase-warning">
                    ⚠️ Add <code>VITE_SUPABASE_ANON_KEY</code> to <code>frontend/.env</code> to enable OTP
                  </div>
                )}

                <button type="submit" className="btn-primary login-btn" disabled={loading || !isSupabaseConfigured}>
                  {loading
                    ? <span className="btn-content-loading"><Loader className="spinner" size={20} /> Sending...</span>
                    : <span className="btn-content-loading">Send OTP <ArrowRight size={18} /></span>}
                </button>
              </>
            ) : (
              <>
                <div className="otp-sent-info">
                  <p className="otp-sent-label">OTP sent to <strong>{otpValue}</strong></p>
                  <button type="button" className="otp-change-btn" onClick={() => { setOtpSent(false); setOtpDigits(['','','','','','']); setError(''); setSuccessMsg(''); }}>
                    <ChevronLeft size={14} /> Change
                  </button>
                </div>

                <div className="form-group">
                  <label>Enter 6-digit OTP</label>
                  <div className="otp-boxes">
                    {otpDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={el => otpInputRefs.current[i] = el}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        className={`otp-box ${d ? 'otp-box-filled' : ''}`}
                        value={d}
                        onChange={e => handleOtpDigit(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        onPaste={i === 0 ? handleOtpPaste : undefined}
                      />
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn-primary login-btn" disabled={loading || otpDigits.join('').length !== 6}>
                  {loading
                    ? <span className="btn-content-loading"><Loader className="spinner" size={20} /> Verifying...</span>
                    : 'Verify & Sign In'}
                </button>

                <div className="otp-resend-row">
                  {otpResendTimer > 0
                    ? <span className="otp-timer">Resend in {otpResendTimer}s</span>
                    : <button type="button" className="text-btn" onClick={handleSendOtp} disabled={loading}>Resend OTP</button>}
                </div>
              </>
            )}
          </form>
        )}

        {/* ══ GOOGLE BUTTON ════════════════════════════════════ */}
        <div className="auth-divider"><span>OR</span></div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogleLogin}
          disabled={googleLoading || !isSupabaseConfigured}
          title={!isSupabaseConfigured ? 'Configure Supabase keys in frontend/.env to enable' : 'Continue with Google'}
        >
          {googleLoading ? (
            <span className="btn-content-loading"><Loader className="spinner" size={18} /> Redirecting...</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 48 48" className="google-icon">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.021 35.601 44 30.073 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {!isSupabaseConfigured && (
          <p className="google-setup-hint">
            💡 Add your Supabase keys to <code>frontend/.env</code> to enable Google Sign-In &amp; OTP
          </p>
        )}
      </div>
    </div>
  );
}
