'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import * as api from '@/lib/api';
import type { Friend } from '@/lib/types';

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .listFriends()
      .then((list) => {
        setFriends(list);
        try { localStorage.setItem('cagnotte-friends', JSON.stringify(list)); } catch {}
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

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

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const friend = await api.sendFriendRequest(email.trim());
      setFriends((prev) => [...prev, friend]);
      setEmail('');
      setSuccess('Friend request sent!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function acceptFriend(friendId: string) {
    setError(null);
    try {
      await api.respondFriendRequest(friendId, 'accept');
      setFriends((prev) =>
        prev.map((f) => (f.friendId === friendId ? { ...f, status: 'accepted' as const } : f)),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function declineFriend(friendId: string) {
    setError(null);
    try {
      await api.respondFriendRequest(friendId, 'decline');
      setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function cancelSent(friendId: string) {
    setError(null);
    try {
      await api.removeFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(friendId: string) {
    setError(null);
    try {
      await api.removeFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.friendId !== friendId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <p className="sub">Loading…</p>;

  return (
    <main>
      <div className="tracking-header">
        <h1 className="page-title">Friends</h1>
        <p className="page-sub">Add friends by email to split expenses together.</p>
      </div>

      {error && (
        <p className="split-hint" style={{ color: 'var(--negative)', marginBottom: 16 }}>{error}</p>
      )}
      {success && (
        <p className="split-hint" style={{ color: 'var(--positive)', marginBottom: 16 }}>{success}</p>
      )}

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
                      onClick={() => acceptFriend(f.friendId)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                      onClick={() => declineFriend(f.friendId)}
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
                    onClick={() => cancelSent(f.friendId)}
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
                            onClick={() => remove(friend.friendId)}
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