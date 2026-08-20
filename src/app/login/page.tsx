'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import * as auth from '@/lib/auth';

type View = 'signIn' | 'signUp' | 'confirm' | 'forgot' | 'resetConfirm';

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Go home.
  useEffect(() => {
    const user = auth.currentUser();
    if (user) router.replace('/');
  }, [router]);

  // Don't render login form if already signed in
  const user = auth.currentUser();
  if (user) return null;

  async function handleSignIn(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        await auth.signIn(email, password);
        window.location.href = '/';
      } catch (err) {
        const error = err as Error & { code?: string };
        if (error.code === 'UserNotConfirmedException') {
          setView('confirm');
          setMessage('Please confirm your email first.');
        } else {
          setError(error.message);
        }
      } finally {
        setBusy(false);
      }
    }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.signUp(email, password, name);
      setView('confirm');
      setMessage('Check your email for a verification code.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.confirmSignUp(email, code);
      setMessage(null);
      await auth.signIn(email, password);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.forgotPassword(email);
      setView('resetConfirm');
      setMessage('Check your email for a reset code.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.confirmForgotPassword(email, code, newPassword);
      await auth.signIn(email, newPassword);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await auth.resendCode(email);
      setMessage('New code sent to your email.');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-header">
          <Image src="/logo.png" alt="" width={40} height={40} />
          <h1 className="login-title">Cagnotte</h1>
          <p className="login-sub">
            {view === 'signIn' && 'Sign in to your account'}
            {view === 'signUp' && 'Create your account'}
            {view === 'confirm' && 'Verify your email'}
            {view === 'forgot' && 'Reset your password'}
            {view === 'resetConfirm' && 'Enter reset code'}
          </p>
        </div>

        {message && <p className="login-message">{message}</p>}
        {error && <p className="login-error">{error}</p>}

        {view === 'signIn' && (
          <form onSubmit={handleSignIn} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.requestSubmit(); }}>
            <label className="field">
              <span className="field-label">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setError(null); setView('signUp'); }}>
                Create an account
              </button>
              <button type="button" className="link-btn" onClick={() => { setError(null); setView('forgot'); }}>
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {view === 'signUp' && (
          <form onSubmit={handleSignUp}>
            <label className="field">
              <span className="field-label">Name</span>
              <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" autoComplete="name" />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setError(null); setView('signIn'); }}>
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}

        {view === 'confirm' && (
          <form onSubmit={handleConfirm}>
            <label className="field">
              <span className="field-label">Verification code</span>
              <input className="input" type="text" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="123456" autoComplete="one-time-code" />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify email'}
            </button>
            <div className="login-links">
              <button type="button" className="link-btn" onClick={handleResend}>
                Resend code
              </button>
              <button type="button" className="link-btn" onClick={() => { setError(null); setMessage(null); setView('signIn'); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgot}>
            <label className="field">
              <span className="field-label">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setError(null); setView('signIn'); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {view === 'resetConfirm' && (
          <form onSubmit={handleResetConfirm}>
            <label className="field">
              <span className="field-label">Reset code</span>
              <input className="input" type="text" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="123456" autoComplete="one-time-code" />
            </label>
            <label className="field">
              <span className="field-label">New password</span>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            <button type="submit" className="btn login-btn" disabled={busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
            <div className="login-links">
              <button type="button" className="link-btn" onClick={() => { setError(null); setMessage(null); setView('signIn'); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}