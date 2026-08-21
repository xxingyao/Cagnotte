'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import * as api from '@/lib/api';
import { avatarUrl } from '@/lib/avatar';
import { CURRENCIES } from '@/lib/options';

const MAX_BYTES = 2 * 1024 * 1024;
const THEME_KEY = 'cagnotte:theme';
const CURRENCY_KEY = 'cagnotte:default-currency';
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
  const { user, ready, userId } = useStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<ThemeChoice>('light');
  const [defaultCurrency, setDefaultCurrency] = useState('SGD');
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  function addToast(msg: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message: msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  /* Load saved preferences */
  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY) as ThemeChoice | null;
      if (t) { 
        setTheme(t); 
        applyTheme(t); 
      }
      const c = localStorage.getItem(CURRENCY_KEY);
      if (c) setDefaultCurrency(c);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setDisplayName(n);
    } catch {}
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

  function changeCurrency(c: string) {
    setDefaultCurrency(c);
    try { localStorage.setItem(CURRENCY_KEY, c); } catch {}
    addToast(`Default currency set to ${c}! 💱`);
  }

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setDisplayName(trimmed);
    try { localStorage.setItem(NAME_KEY, trimmed); } catch {}
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

      {/* ── Default currency ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Default currency</h2>
        </div>
        <select className="select" value={defaultCurrency}
          onChange={(e) => changeCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <p className="split-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Pre-selected when you create a new group.
        </p>
      </div>

      {/* ── Theme toggle ── */}
      <div className="card">
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
    </main>
  );
}