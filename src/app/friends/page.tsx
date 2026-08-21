'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import * as api from '@/lib/api';
import type { Friend } from '@/lib/types';

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface ConfirmState {
  message: string;
  action: () => Promise<void>;
}

let toastId = 0;

export default function FriendsPage() {
  const { data, userId } = useStore();
  const [friends, setFriends] = useState<Friend[]>(() => {
    try {
      const cached = localStorage.getItem('cagnotte-friends');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      return !localStorage.getItem('cagnotte-friends');
    } catch {
      return true;
    }
  });
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const toastTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    api
      .listFriends()
      .then((list) => {
        setFriends(list);
        try { localStorage.setItem('cagnotte-friends', JSON.stringify(list)); } catch {}
      })
      .catch((e) => showToast('error', (e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Clean up toast timers on unmount
  useEffect(() => {
    const timers = toastTimers.current;
    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, []);

  function showToast(type: 'success' | 'error', message: string) {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimers.current.delete(id);
    }, 4000);
    toastTimers.current.set(id, timer);
  }

  function askConfirm(message: string, action: () => Promise<void>) {
    setConfirm({ message, action });
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirming(true);
    try {
      await confirm.action();
    } finally {
      setConfirming(false);
      setConfirm(null);
    }
  }

  const sharedGroupsByName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of data.groups) {
      const youAreIn = group.members.some((m) => m.id === userId);
      if (!youAreIn) continue;
      for (const member of group.members) {
        if (member.id === userId) continue;
        const key = member.name.toLowerCase().trim();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(group.name);
      }
    }
    return map;
  }, [data.groups, userId]);

  function getSharedGroups(friend: Friend): string[] {
    const byName = sharedGroupsByName.get(friend.friendName.toLowerCase().trim()) ?? [];
    if (byName.length > 0) return byName;
    if (friend.friendEmail) {
      return sharedGroupsByName.get(friend.friendEmail.toLowerCase().trim()) ?? [];
    }
    return [];
  }

  const pendingRequests = friends.filter((f) => f.status === 'pending');
  const sentRequests = friends.filter((f) => f.status === 'sent');
  const acceptedFriends = friends.filter((f) => f.status === 'accepted');

  const filtered = search.trim()
    ? acceptedFriends.filter(
        (f) =>
          f.friendName.toLowerCase().includes(search.toLowerCase()) ||
          f.friendEmail.toLowerCase().includes(search.toLowerCase()),
      )
    : acceptedFriends;

  function updateCache(list: Friend[]) {
    try { localStorage.setItem('cagnotte-friends', JSON.stringify(list)); } catch {}
  }

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const friend = await api.sendFriendRequest(email.trim());
      const updated = [...friends, friend];
      setFriends(updated);
      updateCache(updated);
      setEmail('');
      showToast('success', `Friend request sent to ${friend.friendEmail}!`);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function acceptFriend(friendId: string, name: string) {
    try {
      await api.respondFriendRequest(friendId, 'accept');
      const updated = friends.map((f) =>
        f.friendId === friendId ? { ...f, status: 'accepted' as const } : f,
      );
      setFriends(updated);
      updateCache(updated);
      showToast('success', `You and ${name} are now friends!`);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  async function declineFriend(friendId: string) {
    try {
      await api.respondFriendRequest(friendId, 'decline');
      const updated = friends.filter((f) => f.friendId !== friendId);
      setFriends(updated);
      updateCache(updated);
      showToast('success', 'Request declined.');
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  async function cancelSent(friendId: string) {
    try {
      await api.removeFriend(friendId);
      const updated = friends.filter((f) => f.friendId !== friendId);
      setFriends(updated);
      updateCache(updated);
      showToast('success', 'Request cancelled.');
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  async function remove(friendId: string) {
    try {
      await api.removeFriend(friendId);
      const updated = friends.filter((f) => f.friendId !== friendId);
      setFriends(updated);
      updateCache(updated);
      showToast('success', 'Friend removed.');
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  if (loading) return <p className="sub">Loading…</p>;

  return (
    <main>
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => !confirming && setConfirm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Are you sure?</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setConfirm(null)}
                disabled={confirming}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="modal-message">{confirm.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirm(null)}
                disabled={confirming}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={runConfirm}
                disabled={confirming}
              >
                {confirming ? 'Removing…' : 'Yes, remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tracking-header">
        <h1 className="page-title">Friends</h1>
        <p className="page-sub">Add friends by email to split expenses together.</p>
      </div>

      <div className="tracking-summary">
        <div className="summary-card">
          <p className="summary-card-label">Friends</p>
          <p className="summary-card-value">{acceptedFriends.length}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Pending</p>
          <p className="summary-card-value">{pendingRequests.length}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Sent</p>
          <p className="summary-card-value">{sentRequests.length}</p>
        </div>
      </div>

      {/* Add friend by email */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Add friend</h2>
        </div>
        <form className="friend-add-form" onSubmit={sendRequest}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            required
          />
          <button type="submit" className="btn" style={{ width: 'auto', whiteSpace: 'nowrap' }} disabled={sending}>
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </form>
      </div>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2 className="card-title">Pending requests ({pendingRequests.length})</h2>
          </div>
          <ul className="friend-list">
            {pendingRequests.map((f) => {
              const initials = f.friendName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              const hue = f.friendName.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
              return (
                <li key={f.friendId} className="friend-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="friend-avatar" style={{ background: `hsl(${hue}, 55%, 50%)` }}>
                      {initials}
                    </div>
                    <div className="friend-info">
                      <span className="friend-name">{f.friendName}</span>
                      <span className="friend-email">{f.friendEmail}</span>
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button
                      type="button"
                      className="btn"
                      style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                      onClick={() => acceptFriend(f.friendId, f.friendName)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                      onClick={() =>
                        askConfirm(
                          `Decline the friend request from ${f.friendName}?`,
                          () => declineFriend(f.friendId),
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Sent requests */}
      {sentRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2 className="card-title">Sent requests ({sentRequests.length})</h2>
          </div>
          <ul className="friend-list">
            {sentRequests.map((f) => {
              const initials = f.friendName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              const hue = f.friendName.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
              return (
                <li key={f.friendId} className="friend-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="friend-avatar" style={{ background: `hsl(${hue}, 55%, 50%)` }}>
                      {initials}
                    </div>
                    <div className="friend-info">
                      <span className="friend-name">{f.friendName}</span>
                      <span className="friend-email">{f.friendEmail}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                    onClick={() =>
                      askConfirm(
                        `Cancel the friend request to ${f.friendName}?`,
                        () => cancelSent(f.friendId),
                      )
                    }
                  >
                    Cancel
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Accepted friends */}
      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Your friends</h2>
          {acceptedFriends.length > 3 && (
            <input
              className="input friends-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
          )}
        </div>

        {acceptedFriends.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">👥</div>
            <p>No friends yet.</p>
            <p className="sub">Send a friend request by email above.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="tracking-empty">
            <p className="sub">No friends match &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-mobile">Email</th>
                  <th>Shared groups</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((friend) => {
                  const shared = getSharedGroups(friend);
                  const initials = friend.friendName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const hue =
                    friend.friendName.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
                  return (
                    <tr key={friend.friendId}>
                      <td>
                        <div className="tracking-name-cell">
                          <div
                            className="friend-avatar"
                            style={{ background: `hsl(${hue}, 55%, 50%)` }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="tracking-name">{friend.friendName}</div>
                            <div className="tracking-type">{friend.friendEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hide-mobile" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                        {friend.friendEmail || '—'}
                      </td>
                      <td>
                        {shared.length > 0 ? (
                          <div className="friend-groups">
                            {shared.map((g) => (
                              <span key={g} className="chip friend-group-chip">{g}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="sub">None yet</span>
                        )}
                      </td>
                      <td>
                        <div className="tracking-actions">
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm is-danger"
                            onClick={() =>
                              askConfirm(
                                `Remove ${friend.friendName} from your friends?`,
                                () => remove(friend.friendId),
                              )
                            }
                            title="Remove"
                          >
                            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}