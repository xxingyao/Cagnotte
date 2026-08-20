'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import * as api from '@/lib/api';
import { avatarUrl } from '@/lib/avatar';
import type { Friend } from '@/lib/types';

const MAX_BYTES = 2 * 1024 * 1024;

export default function SettingsPage() {
  const { user, ready, userId } = useStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Friends state ──────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendEmail, setFriendEmail] = useState('');
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendSuccess, setFriendSuccess] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    api
      .listFriends()
      .then(setFriends)
      .catch((err) => setFriendError((err as Error).message))
      .finally(() => setFriendsLoading(false));
  }, [ready, user]);

  if (!ready) return <p className="sub">Loading…</p>;
  if (!user) return null;

  // ─── Avatar helpers ─────────────────────────────────────────────────────

  function pickFile() {
    fileInputRef.current?.click();
  }

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
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  // ─── Friend actions ─────────────────────────────────────────────────────

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!friendEmail.trim()) return;
    setFriendError(null);
    setFriendSuccess(null);
    setFriendBusy(true);
    try {
      const friend = await api.sendFriendRequest(friendEmail.trim());
      setFriends((prev) => [...prev, friend]);
      setFriendEmail('');
      setFriendSuccess('Friend request sent!');
    } catch (err) {
      setFriendError((err as Error).message);
    } finally {
      setFriendBusy(false);
    }
  }

  async function acceptRequest(friendId: string) {
    setFriendError(null);
    try {
      await api.respondFriendRequest(friendId, 'accept');
      setFriends((prev) =>
        prev.map((f) => (f.friendId === friendId ? { ...f, status: 'accepted' as const } : f)),
      );
    } catch (err) {
      setFriendError((err as Error).message);
    }
  }

  async function declineRequest(friendId: string) {
    setFriendError(null);
    try {
      await api.respondFriendRequest(friendId, 'decline');
      setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    } catch (err) {
      setFriendError((err as Error).message);
    }
  }

  async function cancelRequest(friendId: string) {
    setFriendError(null);
    try {
      await api.removeFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    } catch (err) {
      setFriendError((err as Error).message);
    }
  }

  async function handleRemoveFriend(friendId: string) {
    setFriendError(null);
    try {
      await api.removeFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    } catch (err) {
      setFriendError((err as Error).message);
    }
  }

  const displayUrl = previewUrl ?? avatarUrl(userId);

  const pendingRequests = friends.filter((f) => f.status === 'pending');
  const sentRequests = friends.filter((f) => f.status === 'sent');
  const acceptedFriends = friends.filter((f) => f.status === 'accepted');

  return (
    <main>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Signed in as {user.email}</p>

      {/* ─── Profile picture ─── */}
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

      {/* ─── Friends ─── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Friends</h2>
        </div>

        {/* Add friend form */}
        <form className="friend-add-form" onSubmit={sendRequest}>
          <input
            className="input"
            type="email"
            value={friendEmail}
            onChange={(e) => setFriendEmail(e.target.value)}
            placeholder="friend@example.com"
            required
          />
          <button type="submit" className="btn" style={{ width: 'auto', whiteSpace: 'nowrap' }} disabled={friendBusy}>
            {friendBusy ? 'Sending…' : 'Add friend'}
          </button>
        </form>

        {friendSuccess && (
          <p className="friend-message friend-message-success">{friendSuccess}</p>
        )}
        {friendError && (
          <p className="friend-message friend-message-error">{friendError}</p>
        )}

        {friendsLoading ? (
          <p className="sub" style={{ marginTop: 12 }}>Loading friends…</p>
        ) : (
          <>
            {/* Pending requests received */}
            {pendingRequests.length > 0 && (
              <div className="friend-section">
                <h3 className="friend-section-title">
                  Pending requests ({pendingRequests.length})
                </h3>
                <ul className="friend-list">
                  {pendingRequests.map((f) => (
                    <li key={f.friendId} className="friend-row">
                      <div className="friend-info">
                        <span className="friend-name">{f.friendName}</span>
                        <span className="friend-email">{f.friendEmail}</span>
                      </div>
                      <div className="friend-actions">
                        <button
                          type="button"
                          className="btn"
                          style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                          onClick={() => acceptRequest(f.friendId)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                          onClick={() => declineRequest(f.friendId)}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Accepted friends */}
            {acceptedFriends.length > 0 && (
              <div className="friend-section">
                <h3 className="friend-section-title">
                  Your friends ({acceptedFriends.length})
                </h3>
                <ul className="friend-list">
                  {acceptedFriends.map((f) => (
                    <li key={f.friendId} className="friend-row">
                      <div className="friend-info">
                        <span className="friend-name">{f.friendName}</span>
                        <span className="friend-email">{f.friendEmail}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                        onClick={() => handleRemoveFriend(f.friendId)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sent requests */}
            {sentRequests.length > 0 && (
              <div className="friend-section">
                <h3 className="friend-section-title">
                  Sent requests ({sentRequests.length})
                </h3>
                <ul className="friend-list">
                  {sentRequests.map((f) => (
                    <li key={f.friendId} className="friend-row">
                      <div className="friend-info">
                        <span className="friend-name">{f.friendName}</span>
                        <span className="friend-email">{f.friendEmail}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                        onClick={() => cancelRequest(f.friendId)}
                      >
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Empty state */}
            {friends.length === 0 && (
              <p className="sub" style={{ marginTop: 12 }}>
                No friends yet — add someone by email above.
              </p>
            )}
          </>
        )}
      </div>

      {/* ─── Coming soon ─── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Coming soon</h2>
        </div>
        <p className="sub">
          Display name, default currency, theme, and account deletion will live
          here next.
        </p>
      </div>
    </main>
  );
}