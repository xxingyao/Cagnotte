'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';

interface Friend {
  id: string;
  name: string;
  email: string;
  notes: string;
  addedAt: string;
}

const STORAGE_KEY = 'cagnotte:friends';

function loadFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Friend[]) : [];
  } catch {
    return [];
  }
}

function saveFriends(friends: Friend[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(friends));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function FriendsPage() {
  const { data, userId } = useStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    setFriends(loadFriends());
    setLoaded(true);
  }, []);

  // Persist whenever friends change (skip the initial empty-state write)
  useEffect(() => {
    if (loaded) saveFriends(friends);
  }, [friends, loaded]);

  // Build a lookup: member name → list of group names they share with you
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

  // Also match by email if the member name matches a friend's email
  function getSharedGroups(friend: Friend): string[] {
    const byName = sharedGroupsByName.get(friend.name.toLowerCase().trim()) ?? [];
    if (byName.length > 0) return byName;
    // Fallback: check if any member name matches the friend's email
    if (friend.email) {
      return sharedGroupsByName.get(friend.email.toLowerCase().trim()) ?? [];
    }
    return [];
  }

  const filtered = search.trim()
    ? friends.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.email.toLowerCase().includes(search.toLowerCase()),
      )
    : friends;

  function openAdd() {
    setEditId(null);
    setName('');
    setEmail('');
    setNotes('');
    setShowModal(true);
  }

  function openEdit(friend: Friend) {
    setEditId(friend.id);
    setName(friend.name);
    setEmail(friend.email);
    setNotes(friend.notes);
    setShowModal(true);
  }

  function save() {
    if (!name.trim()) return;
    const entry: Friend = {
      id: editId ?? crypto.randomUUID(),
      name: name.trim(),
      email: email.trim(),
      notes: notes.trim(),
      addedAt: editId ? friends.find((f) => f.id === editId)?.addedAt ?? today() : today(),
    };
    if (editId) {
      setFriends((prev) => prev.map((f) => (f.id === editId ? entry : f)));
    } else {
      setFriends((prev) => [...prev, entry]);
    }
    setShowModal(false);
  }

  function remove(id: string) {
    setFriends((prev) => prev.filter((f) => f.id !== id));
  }

  if (!loaded) return <p className="sub">Loading…</p>;

  return (
    <main>
      <div className="tracking-header">
        <h1 className="page-title">Friends</h1>
        <p className="page-sub">People you split expenses with. Add them here for quick reference.</p>
      </div>

      <div className="tracking-summary">
        <div className="summary-card">
          <p className="summary-card-label">Total friends</p>
          <p className="summary-card-value">{friends.length}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">In your groups</p>
          <p className="summary-card-value">
            {friends.filter((f) => getSharedGroups(f).length > 0).length}
          </p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Your groups</p>
          <p className="summary-card-value">{data.groups.length}</p>
        </div>
      </div>

      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Your friends</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {friends.length > 3 && (
              <input
                className="input friends-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
              />
            )}
            <button type="button" className="tracking-add-btn" onClick={openAdd}>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Add friend
            </button>
          </div>
        </div>

        {friends.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">👥</div>
            <p>No friends added yet.</p>
            <p className="sub">Add people you frequently split expenses with.</p>
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
                  <th className="hide-mobile">Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((friend) => {
                  const shared = getSharedGroups(friend);
                  const initials = friend.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  // Deterministic colour from name
                  const hue =
                    friend.name.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
                  return (
                    <tr key={friend.id}>
                      <td>
                        <div className="tracking-name-cell">
                          <div
                            className="friend-avatar"
                            style={{ background: `hsl(${hue}, 55%, 50%)` }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="tracking-name">{friend.name}</div>
                            <div className="tracking-type">Added {friend.addedAt}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hide-mobile" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                        {friend.email || '—'}
                      </td>
                      <td>
                        {shared.length > 0 ? (
                          <div className="friend-groups">
                            {shared.map((g) => (
                              <span key={g} className="chip friend-group-chip">
                                {g}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="sub">None yet</span>
                        )}
                      </td>
                      <td className="hide-mobile" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                        {friend.notes || '—'}
                      </td>
                      <td>
                        <div className="tracking-actions">
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm"
                            onClick={() => openEdit(friend)}
                            title="Edit"
                          >
                            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                              <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm is-danger"
                            onClick={() => remove(friend.id)}
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

      {/* Add / Edit modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editId ? 'Edit friend' : 'Add friend'}</h2>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah"
                autoFocus
              />
            </label>
            <label className="field">
              <span className="field-label">Email (optional)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sarah@example.com"
              />
            </label>
            <label className="field">
              <span className="field-label">Notes (optional)</span>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Roommate, colleague"
              />
            </label>
            <p className="split-hint" style={{ marginTop: 4 }}>
              💡 Use the same name they use in groups so shared groups show up automatically.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={save} disabled={!name.trim()}>
                {editId ? 'Save changes' : 'Add friend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}