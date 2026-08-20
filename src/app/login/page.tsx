'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import * as auth from '@/lib/auth';

type View = 'signIn' | 'signUp' | 'confirm' | 'forgot' | 'resetConfirm';

export default function LoginPage() {
  const [view, setView] = useState<View>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // If already signed in, go straight to the dashboard.
  useEffect(() => {
    if (auth.currentUser()) {
      window.location.href = '/';
    }
  }, []);

  // Don't flash the login form for signed-in users.
  if (typeof window !== 'undefined' && auth.currentUser()) return null;

  function reset() {
    setError('');
    setMessage('');
    setCode('');
    setNewPassword('');
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.signIn(email, password);
      // Full reload so StoreProvider re-initializes with the new user.
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.signUp(email, password, name);
      setMessage('Check your email for a verification code.');
      setView('confirm');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.confirmSignUp(email, code);
      setMessage('Account verified! Sign in to get started.');
      setView('signIn');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError('');
    setBusy(true);
    try {
      await auth.resendCode(email);
      setMessage('A new code has been sent to your email.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.forgotPassword(email);
      setMessage('Check your email for the reset code.');
      setView('resetConfirm');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.confirmForgotPassword(email, code, newPassword);
      setMessage('Password reset! Sign in with your new password.');
      setView('signIn');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <Image src="/logo.png" alt="" width={48} height={48} className="login-logo" priority />
          <h1 className="login-title">
            {view === 'signIn' && 'Welcome back'}
            {view === 'signUp' && 'Create your account'}
            {view === 'confirm' && 'Verify your email'}
            {view === 'forgot' && 'Reset your password'}
            {view === 'resetConfirm' && 'Enter reset code'}
          </h1>
          <p className="login-sub">
            {view === 'signIn' && 'Sign in to your Cagnotte account'}
            {view === 'signUp' && 'Start splitting expenses with friends'}
            {view === 'confirm' && `We sent a code to ${email}`}
            {view === 'forgot' && "Enter your email and we’ll send a reset code"}
            {view === 'resetConfirm' && `Enter the code sent to ${email}`}
          </p>
        </div>

        {message && <p className="login-message">{message}</p>}
        {error && <p className="login-error">{error}</p>}

        {/* ─── Sign In ─── */}
                {view === 'signIn' && (
          <form action="#" onSubmit={handleSignIn}>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="login-links">
              <button
                type="button"
                className="link-btn"
                onClick={() => { reset(); setView('forgot'); }}
              >
                Forgot password?
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => { reset(); setView('signUp'); }}
              >
                Create an account
              </button>
            </div>
          </form>
        )}

        {/* ─── Sign Up ─── */}
        {view === 'signUp' && (
          <form onSubmit={handleSignUp}>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            <div className="login-links">
              <button
                type="button"
                className="link-btn"
                onClick={() => { reset(); setView('signIn'); }}
              >
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}

        {/* ─── Confirm (email verification) ─── */}
        {view === 'confirm' && (
          <form onSubmit={handleConfirm}>
            <label className="field">
              <span className="field-label">Verification code</span>
              <input
                className="input chip-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <div className="login-links">
              <button type="button" className="link-btn" onClick={handleResend} disabled={busy}>
                Resend code
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => { reset(); setView('signIn'); }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ─── Forgot password ─── */}
        {view === 'forgot' && (
          <form onSubmit={handleForgot}>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
            <div className="login-links">
              <button
                type="button"
                className="link-btn"
                onClick={() => { reset(); setView('signIn'); }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ─── Reset confirm (new password) ─── */}
        {view === 'resetConfirm' && (
          <form onSubmit={handleResetConfirm}>
            <label className="field">
              <span className="field-label">Reset code</span>
              <input
                className="input chip-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">New password</span>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
            <div className="login-links">
              <button
                type="button"
                className="link-btn"
                onClick={() => { reset(); setView('signIn'); }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
