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
  label?: string;
}

let toastId = 0;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Fun messages ────────────────────────────────────────────────────────────

const CONFIRM_REMOVE = (n: string) => pick([
  `Are you sure you wanna break ${n}'s heart? 💔`,
  `Really? ${n} thought you two had something special…`,
  `${n} is going to cry in the shower tonight. Proceed?`,
  `Unfriending ${n}? That's cold. Are you sure?`,
  `${n} just felt a chill down their spine. Remove anyway?`,
]);

const CONFIRM_DECLINE = (n: string) => pick([
  `Reject ${n}? They spent ages crafting that request…`,
  `Leave ${n} on read? That's savage.`,
  `Not feeling the vibe? Decline ${n}'s request?`,
  `Ouch. Turn down ${n}? Are you sure?`,
  `${n} is refreshing their phone right now. Decline anyway?`,
]);

const CONFIRM_CANCEL = (n: string) => pick([
  `Take it back before ${n} sees? Smart move.`,
  `Changed your mind about ${n}? No judgment.`,
  `Abort mission? Cancel request to ${n}?`,
  `Got cold feet? Cancel the request to ${n}?`,
  `Pull the plug on ${n}'s invite?`,
]);

const TOAST_REMOVED = (n: string) => pick([
  `${n} has been yeeted from your friends list.`,
  `Goodbye ${n}. It was nice while it lasted.`,
  `${n} removed. You monster. 🥶`,
  `It's done. ${n} is no more (as a friend).`,
  `Poof. ${n} is gone. 💨`,
]);

const TOAST_DECLINED = (n: string) => pick([
  `Request from ${n} declined. Brutal.`,
  `Nope'd ${n}'s request. 🙅`,
  `${n}'s request has been sent to the shadow realm.`,
  `${n}? Never heard of them.`,
  `Request declined. ${n} will recover… probably.`,
]);

const TOAST_CANCELLED = (n: string) => pick([
  `Request to ${n} cancelled. They'll never know. 🤫`,
  `Aborted! ${n} won't see a thing.`,
  `Changed your mind. No harm done.`,
  `Request pulled. ${n} remains blissfully unaware.`,
  `Mission aborted. ${n} dodged your friendship.`,
]);

const TOAST_ACCEPTED = (n: string) => pick([
  `You and ${n} are now besties! 🎉`,
  `${n} is officially your friend! Time to split some bills.`,
  `Friendship unlocked with ${n}! 🔓`,
  `Welcome ${n} to the squad! 🤝`,
  `${n} accepted! The beginning of a beautiful friendship.`,
]);

const TOAST_SENT = (n: string) => pick([
  `Friend request sent to ${n}! 🚀`,
  `Request fired off to ${n}! Now we wait…`,
  `Sliding into ${n}'s friend requests… ✉️`,
  `${n} has a pending request from you!`,
  `Request sent! Ball's in ${n}'s court now.`,
]);

// ─── Component ───────────────────────────────────────────────────────────────

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

  function askConfirm(message: string, action: () => Promise<void>, label?: string) {
    setConfirm({ message, action, label });
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

  // Group members who aren't already friends (suggestion pool)
  const suggestions = useMemo(() => {
    const friendEmails = new Set(friends.map((f) => f.friendEmail.toLowerCase()));
    const seen = new Set<string>();
    const result: { name: string; email: string }[] = [];

    for (const group of data.groups) {
      for (const member of group.members) {
        if (member.id === userId) continue;
        const key = member.id;
        if (seen.has(key)) continue;
        seen.add(key);
        // We don't have member emails directly — but if they match a friend,
        // we can skip. Otherwise they show as name-only suggestions.
        result.push({ name: member.name, email: '' });
      }
    }
    return result;
  }, [data.groups, userId, friends]);

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
      showToast('success', TOAST_SENT(friend.friendName || friend.friendEmail));
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
      showToast('success', TOAST_ACCEPTED(name));
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  async function declineFriend(friendId: string, name: string) {
    try {
      await api.respondFriendRequest(friendId, 'decline');
      const updated = friends.filter((f) => f.friendId !== friendId);
      setFriends(updated);
      updateCache(updated);
      showToast('error', TOAST_DECLINED(name));
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  async function cancelSent(friendId: string, name: string) {
    try {
      await api.removeFriend(friendId);
      const updated = friends.filter((f) => f.friendId !== friendId);
      setFriends(updated);
      updateCache(updated);
      showToast('error', TOAST_CANCELLED(name));
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }

  async function removeFriend(friendId: string, name: string) {
    try {
      await api.removeFriend(friendId);
      const updated = friends.filter((f) => f.friendId !== friendId);
      setFriends(updated);
      updateCache(updated);
      showToast('error', TOAST_REMOVED(name));
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
              <h2 className="modal-title">Hold up…</h2>
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
                Nah, keep them
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={runConfirm}
                disabled={confirming}
              >
                {confirming ? 'Doing it…' : (confirm.label || 'Do it')}
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
                          CONFIRM_DECLINE(f.friendName),
                          () => declineFriend(f.friendId, f.friendName),
                          'Decline',
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
                        CONFIRM_CANCEL(f.friendName),
                        () => cancelSent(f.friendId, f.friendName),
                        'Cancel it',
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
                                CONFIRM_REMOVE(friend.friendName),
                                () => removeFriend(friend.friendId, friend.friendName),
                                'Remove them',
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