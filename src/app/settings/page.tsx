'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import * as api from '@/lib/api';
import { avatarUrl } from '@/lib/avatar';

const MAX_BYTES = 2 * 1024 * 1024;

export default function SettingsPage() {
  const { user, ready, userId } = useStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!ready) return <p className="sub">Loading…</p>;
  if (!user) return null;

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets picking the same file again re-trigger onChange
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
      // reader.result is "data:image/png;base64,AAAA..." — only the part
      // after the comma is the actual base64 payload the server wants.
      const base64 = String(reader.result).split(',')[1];
      setUploading(true);
      try {
        await api.uploadAvatar(base64, file.type);
        setPreviewUrl(URL.createObjectURL(file));
        setFailed(false);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  const displayUrl = previewUrl ?? avatarUrl(userId);

  return (
    <main>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Signed in as {user.email}</p>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Profile picture</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {failed ? (
            <div
              className="avatar"
              style={{ width: 64, height: 64, fontSize: 22, background: 'var(--brand)' }}
            >
              {(user.name || user.email).trim().slice(0, 2).toUpperCase()}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt=""
              className="avatar avatar-img"
              style={{ width: 64, height: 64 }}
              onError={() => setFailed(true)}
            />
          )}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChosen}
              style={{ display: 'none' }}
            />
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Coming soon</h2>
        </div>
        <p className="sub">
          Display name, default currency, theme, friends, and account deletion will live
          here next.
        </p>
      </div>
    </main>
  );
}