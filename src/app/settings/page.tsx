'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import * as api from '@/lib/api';
import { avatarUrl } from '@/lib/avatar';
import { CurrencySelect } from '@/components/CurrencySelect';
import { currencyName } from '@/lib/currencies';
import { getCurrencies, getDefaultCurrency, onPrefsChange, removeCurrency, setDefaultCurrency } from '@/lib/prefs';

const MAX_BYTES = 2 * 1024 * 1024;
const THEME_KEY = 'cagnotte:theme';
const NAME_KEY = 'cagnotte:display-name';

type ThemeChoice = 'light' | 'dark';

interface Toast { id: number; message: string; type: 'success' | 'error'; }

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyTheme(t: ThemeChoice) {
  document.documentElement.setAttribute('data-theme', t);
}

export default function SettingsPage() {
  const { user, ready, userId, logout } = useStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [myCurrencies, setMyCurrencies] = useState<string[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<ThemeChoice>('light');
  const [defaultCurrency, setDefaultCurrencyState] = useState('SGD');
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const [ingestToken, setIngestToken] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  

  function addToast(msg: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message: msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  /* Load saved preferences */
  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY) as ThemeChoice | null;
      if (t) { setTheme(t); applyTheme(t); }
      const n = localStorage.getItem(NAME_KEY);
      if (n) setDisplayName(n);
    } catch {}
  }, []);

  /* Currency prefs live in prefs.ts and can change from the picker too. */
  useEffect(() => {
    const sync = () => {
      setDefaultCurrencyState(getDefaultCurrency());
      setMyCurrencies(getCurrencies());
    };
    sync();
    return onPrefsChange(sync);
  }, []);
  /* Load saved preferences */
  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY) as ThemeChoice | null;
      if (t) { setTheme(t); applyTheme(t); }
      const n = localStorage.getItem(NAME_KEY);
      if (n) setDisplayName(n);
    } catch {}
  }, []);

  /* Currency prefs live in prefs.ts and can change from the picker too. */
  useEffect(() => {
    const sync = () => {
      setDefaultCurrencyState(getDefaultCurrency());
      setMyCurrencies(getCurrencies());
    };
    sync();
    return onPrefsChange(sync);
  }, []);

  if (!ready) return <p className="sub">Loading…</p>;
  if (!user) return null;

  const currentName = displayName || user.name || user.email.split('@')[0];

  function pickFile() { fileInputRef.current?.click(); }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is too large — 2MB max.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1];
      setUploading(true);
      try {
        await api.uploadAvatar(base64, file.type);
        setPreviewUrl(URL.createObjectURL(file));
        setFailed(false);
        addToast(pick([
          'Photo updated! Looking good. 📸',
          'New look, who dis? 🤳',
          'Avatar changed! Fresh vibes. ✨',
        ]));
      } catch (err) {
        addToast((err as Error).message, 'error');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function changeTheme(next: ThemeChoice) {
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    addToast(next === 'dark' ? 'Dark mode activated. Welcome to the dark side. 🌙' : 'Light mode! Bright and beautiful. ☀️');
  }

  function changeCurrency(code: string) {
    setDefaultCurrency(code); // prefs.ts — also guarantees it's in the list
    addToast(`Default currency set to ${code}! 💱`);
  }

  function dropCurrency(code: string) {
    if (!removeCurrency(code)) {
      addToast(`${code} is your default — pick a different default first.`, 'error');
      return;
    }
    addToast(`${code} removed from your list.`);
  }

  async function rotateToken() {
    setRotating(true);
    try {
      const { token } = await api.rotateIngestToken();
      setIngestToken(token);
      addToast('New token generated. The old one no longer works.');
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setRotating(false);
    }
  }

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setDisplayName(trimmed);
    try { localStorage.setItem(NAME_KEY, trimmed); } catch {}
    // The Sidebar reads this once on mount; a plain write leaves it stale until
    // a reload. The `storage` event doesn't fire in the tab that wrote, so
    // announce it ourselves.
    window.dispatchEvent(new CustomEvent('cagnotte:name-changed', { detail: trimmed }));
    setEditingName(false);
    addToast(pick([
      `You're now "${trimmed}". Identity updated! 🏷️`,
      'Name changed! Witness protection approved. 🕵️',
      'New name saved! The rebranding is complete. ✨',
    ]));
  }

  const displayUrl = previewUrl ?? avatarUrl(userId);

  return (
    <main>
      {/* ── Toasts ── */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            <span className="toast-icon">{t.type === 'error' ? '🔴' : '🟢'}</span>
            {t.message}
          </div>
        ))}
      </div>

      <h1 className="page-title">Settings</h1>

      {/* ── Profile picture ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Profile picture</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {failed ? (
            <div className="avatar"
              style={{ width: 64, height: 64, fontSize: 22, background: 'var(--brand)' }}>
              {currentName.trim().slice(0, 2).toUpperCase()}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt="" className="avatar avatar-img"
              style={{ width: 64, height: 64 }} onError={() => setFailed(true)} />
          )}
          <div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={onFileChosen} style={{ display: 'none' }} />
            <button type="button" className="btn btn-ghost" onClick={pickFile} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
            <p className="split-hint" style={{ marginTop: 6, marginBottom: 0 }}>
              JPEG, PNG, or WebP — 2MB max.
            </p>
          </div>
        </div>
        {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
      </div>

      {/* ── Display name ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Display name</h2>
        </div>
        {editingName ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your name" autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditingName(false);
              }}
            />
            <button type="button" className="btn" style={{ width: 'auto' }} onClick={saveName}>
              Save
            </button>
            <button type="button" className="btn btn-ghost" style={{ width: 'auto' }}
              onClick={() => setEditingName(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 550 }}>{currentName}</span>
            <button type="button" className="btn btn-ghost" style={{ width: 'auto' }}
              onClick={() => { setNameDraft(currentName); setEditingName(true); }}>
              Edit
            </button>
          </div>
        )}
        <p className="split-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          This name is shown in groups and to your friends.
        </p>
      </div>

      {/* ── Currencies ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Default currency</h2>
        </div>
        <CurrencySelect value={defaultCurrency} onChange={changeCurrency} />
        <p className="split-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Pre-selected when you create a new group.
        </p>

        {myCurrencies.length > 1 && (
          <>
            <div className="card-head" style={{ marginTop: 20, marginBottom: 10 }}>
              <h2 className="card-title">Your currencies</h2>
            </div>
            <ul className="pref-currency-list">
              {myCurrencies.map((code) => (
                <li key={code} className="pref-currency-row">
                  <span className="currency-code">{code}</span>
                  <span className="currency-name">{currencyName(code)}</span>
                  {code === defaultCurrency ? (
                    <span className="currency-added">default</span>
                  ) : (
                    <button
                      type="button"
                      className="currency-remove"
                      onClick={() => dropCurrency(code)}
                      title={`Remove ${code}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="split-hint" style={{ marginTop: 8, marginBottom: 0 }}>
              These are the options you&apos;ll see when adding an expense.
            </p>
          </>
        )}
      </div>

      {/* ── Theme toggle ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Theme</h2>
        </div>
        <div className="theme-toggle">
          {['Light', 'Dark'].map((name) => (
            <button
              key={name}
              type="button"
              className={`theme-toggle-btn${theme === name.toLowerCase() ? ' is-active' : ''}`}
              onClick={() => changeTheme(name.toLowerCase() as ThemeChoice)}
            >
              {name === 'Light' ? '☀️' : '🌙'} {name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Auto-capture ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Auto-capture token</h2>
        </div>
        <p className="split-hint" style={{ marginTop: 0 }}>
          For the iOS Shortcut that logs Apple Pay transactions. Write-only — it can
          add to your review inbox and nothing else.
        </p>
        {ingestToken && (
          <div className="token-box">
            <code>{ingestToken}</code>
            <button type="button" className="link-btn"
              onClick={() => { navigator.clipboard?.writeText(ingestToken); addToast('Copied.'); }}>
              Copy
            </button>
          </div>
        )}
        <button type="button" className="btn btn-ghost" style={{ width: 'auto' }}
          onClick={rotateToken} disabled={rotating}>
          {rotating ? 'Generating…' : ingestToken ? 'Generate a new one' : 'Generate token'}
        </button>
        <p className="split-hint" style={{ marginBottom: 0 }}>
          Shown once. Generating a new one immediately stops the old from working.
        </p>
      </div>

      {/* ── Sign out ── */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Account</h2>
        </div>
        <button type="button" className="btn-signout" onClick={logout}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
            <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M10.5 11 14 8l-3.5-3M14 8H6" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sign out
        </button>
        <p className="split-hint" style={{ marginTop: 10, marginBottom: 0 }}>
          You&apos;ll need to sign in again to get back to your groups.
        </p>
      </div>
    </main>
  );
}