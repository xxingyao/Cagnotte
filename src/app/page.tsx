'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatars } from '@/components/Avatars';
import { useStore } from '@/components/StoreProvider';
import { CurrencySelect } from '@/components/CurrencySelect';
import {
  type CustomCategory,
  getCustomCategories,
  getDefaultCurrency,
  getGroupCategories,
  onPrefsChange,
  setCustomCategories,
  setGroupCategories,
} from '@/lib/prefs';

type GroupTab = string;

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DEFAULT_TABS: { key: GroupTab; label: string; icon: string }[] = [
  { key: 'active', label: 'Active', icon: '🟢' },
  { key: 'planning', label: 'Planning', icon: '📋' },
  { key: 'archive', label: 'Archive', icon: '📦' },
];

const DEFAULT_KEYS = new Set(DEFAULT_TABS.map((t) => t.key));

export default function DashboardPage() {
  const { data, ready, user, createGroup, joinGroup } = useStore();
  const [tab, setTab] = useState<GroupTab>('active');
  const [cats, setCats] = useState<Record<string, GroupTab>>({});
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  function addToast(msg: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message: msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  useEffect(() => {
    if (ready && !user) window.location.href = '/login';
  }, [ready, user]);

  // Folders live in prefs.ts, which syncs to the server. Subscribing rather
  // than reading once means a pull from another device lands here too.
  useEffect(() => {
    if (!ready) return;
    const sync = () => {
      setCats(getGroupCategories());
      setCustomCats(getCustomCategories());
    };
    sync();
    return onPrefsChange(sync);
  }, [ready]);

  // Containment check rather than stopPropagation: React's listeners live on
  // `document` too, and stopPropagation doesn't stop sibling listeners on the
  // same node — which would close the menu on mousedown, before the click
  // could ever reach a dropdown item.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(null);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  if (!ready) return <p className="sub">Loading…</p>;
  if (!user) return null;

  const ordered = [...customCats].sort((a, b) => a.order - b.order);
  const allTabs = [
    ...DEFAULT_TABS,
    ...ordered.map((c) => ({ key: c.id, label: c.label, icon: '📁' })),
  ];

  // A folder the user is standing in, if any — drives the folder bar below.
  const activeCustom = ordered.find((c) => c.id === tab) ?? null;

  function categoryOf(groupId: string): GroupTab {
    const assigned = cats[groupId];
    // A group whose folder was deleted falls back to Active.
    if (!assigned) return 'active';
    if (DEFAULT_KEYS.has(assigned)) return assigned;
    return customCats.some((c) => c.id === assigned) ? assigned : 'active';
  }

  const counts: Record<string, number> = {};
  allTabs.forEach((t) => { counts[t.key] = 0; });
  data.groups.forEach((g) => {
    const key = categoryOf(g.id);
    counts[key] = (counts[key] ?? 0) + 1;
  });

  const filtered = data.groups.filter((g) => categoryOf(g.id) === tab);

  /* ── Folder mutations: state and storage together, no effect race ── */

  function commitCustomCats(next: CustomCategory[]) {
    setCustomCats(next);
    setCustomCategories(next); // prefs.ts — writes locally, syncs to server
  }

  function commitCats(next: Record<string, GroupTab>) {
    setCats(next);
    setGroupCategories(next);
  }

  function addCategory() {
    const label = newCatLabel.trim();
    if (!label) return;
    const created: CustomCategory = {
      id: `cat-${Date.now()}`,
      label,
      order: customCats.length,
    };
    commitCustomCats([...customCats, created]);
    setNewCatLabel('');
    setShowAddCategory(false);
    addToast(`"${label}" folder created! 📁`);
  }

  function deleteActiveFolder() {
    if (!activeCustom) return;
    const { id, label } = activeCustom;

    // Send anything living here back to Active before the folder disappears.
    const next = { ...cats };
    Object.keys(next).forEach((groupId) => {
      if (next[groupId] === id) delete next[groupId];
    });
    commitCats(next);
    commitCustomCats(customCats.filter((c) => c.id !== id));

    setConfirmDelete(false);
    setTab('active');
    addToast(`"${label}" deleted. Its groups moved back to Active.`);
  }

  function moveGroup(groupId: string, to: GroupTab) {
    commitCats({ ...cats, [groupId]: to });
    setMenuOpen(null);
    const label = allTabs.find((t) => t.key === to)?.label ?? 'that folder';
    addToast(pick([
      `Moved to ${label}! Organization level: expert. 📂`,
      `Group shuffled to ${label}. Satisfying, isn't it? ✨`,
      `${label} it is! Your groups, your rules. 🎯`,
    ]));
  }

  /* ── Drag to reorder folders ── */

  function handleDragStart(event: React.DragEvent, id: string) {
    setDragId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(event: React.DragEvent, id: string) {
    if (!dragId || id === dragId) return;
    event.preventDefault(); // without this the drop never fires
    event.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) setDragOverId(id);
  }

  function handleDrop(event: React.DragEvent, targetId: string) {
    event.preventDefault();
    const sourceId = dragId ?? event.dataTransfer.getData('text/plain');
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const arr = [...ordered];
    const from = arr.findIndex((c) => c.id === sourceId);
    const to = arr.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;

    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    commitCustomCats(arr.map((c, i) => ({ ...c, order: i })));
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

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

      {/* ── Category tabs ── */}
      <div className="dash-tabs">
        {allTabs.map((t) => {
          const isCustom = !DEFAULT_KEYS.has(t.key);
          return (
            <div
              key={t.key}
              className={
                'dash-tab-item' +
                (dragId === t.key ? ' is-dragging' : '') +
                (dragOverId === t.key ? ' is-drag-over' : '')
              }
              draggable={isCustom}
              onDragStart={isCustom ? (e) => handleDragStart(e, t.key) : undefined}
              onDragOver={isCustom ? (e) => handleDragOver(e, t.key) : undefined}
              onDrop={isCustom ? (e) => handleDrop(e, t.key) : undefined}
              onDragEnd={isCustom ? handleDragEnd : undefined}
            >
              <button
                type="button"
                className={`dash-tab${tab === t.key ? ' is-active' : ''}${isCustom ? ' is-custom' : ''}`}
                onClick={() => { setTab(t.key); setConfirmDelete(false); }}
              >
                {isCustom && (
                  <span className="dash-tab-grip" aria-hidden="true">
                    <svg viewBox="0 0 10 16" width="8" height="12" fill="currentColor">
                      <circle cx="2.5" cy="3" r="1.2" /><circle cx="7.5" cy="3" r="1.2" />
                      <circle cx="2.5" cy="8" r="1.2" /><circle cx="7.5" cy="8" r="1.2" />
                      <circle cx="2.5" cy="13" r="1.2" /><circle cx="7.5" cy="13" r="1.2" />
                    </svg>
                  </span>
                )}
                <span className="dash-tab-icon">{t.icon}</span>
                <span className="dash-tab-label">{t.label}</span>
                <span className="dash-tab-count">{counts[t.key] ?? 0}</span>
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="dash-tab-add"
          onClick={() => setShowAddCategory(!showAddCategory)}
          title="New folder"
        >
          +
        </button>
      </div>

      {/* ── New folder form ── */}
      {showAddCategory && (
        <div className="card dash-form-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              placeholder="e.g. Family, Work, Travel"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCategory();
                if (e.key === 'Escape') setShowAddCategory(false);
              }}
              autoFocus
            />
            <button type="button" className="btn" style={{ width: 'auto' }} onClick={addCategory}>
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto' }}
              onClick={() => setShowAddCategory(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Folder bar: where deleting a folder lives ── */}
      {activeCustom && (
        <div className={`folder-bar${confirmDelete ? ' is-confirming' : ''}`}>
          {confirmDelete ? (
            <>
              <span className="folder-bar-main">
                Delete <strong>{activeCustom.label}</strong>?{' '}
                <span className="sub">
                  {counts[activeCustom.id] === 0
                    ? 'It\u2019s empty.'
                    : `Its ${counts[activeCustom.id]} group${counts[activeCustom.id] === 1 ? '' : 's'} will move back to Active.`}
                </span>
              </span>
              <div className="folder-bar-actions">
                <button type="button" className="card-action" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button type="button" className="folder-bar-delete is-armed" onClick={deleteActiveFolder}>
                  Delete folder
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="folder-bar-main">
                <span className="folder-bar-icon">📁</span>
                <strong>{activeCustom.label}</strong>
                <span className="sub">
                  {counts[activeCustom.id] ?? 0}{' '}
                  {(counts[activeCustom.id] ?? 0) === 1 ? 'group' : 'groups'}
                </span>
              </span>
              <button type="button" className="folder-bar-delete" onClick={() => setConfirmDelete(true)}>
                Delete folder
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Group list ── */}
      {filtered.length === 0 ? (
        <div className="dash-empty">
          <div className="dash-empty-icon">
            {tab === 'active' ? '🏠' : tab === 'planning' ? '📋' : tab === 'archive' ? '📦' : '📁'}
          </div>
          <p>
            {tab === 'active'
              ? 'No active groups — start one below or move one here.'
              : tab === 'planning'
                ? 'No groups planned yet. Move a group here to plan ahead.'
                : tab === 'archive'
                  ? 'Nothing archived. Move inactive groups here to tidy up.'
                  : 'This folder is empty. Use the ⋯ menu on any group to move it here.'}
          </p>
        </div>
      ) : (
        <ul className="group-list">
          {filtered.map((group) => {
            const open = menuOpen === group.id;
            return (
              <li key={group.id} className="group-card-wrap">
                <Link href={`/groups/${group.id}`} className="group-card">
                  <div className="group-card-main">
                    <div className="group-card-name">{group.name}</div>
                    <div className="group-card-meta">
                      {group.members.length}{' '}
                      {group.members.length === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  <Avatars members={group.members} />
                </Link>
                <span className="chip">{group.baseCurrency}</span>
                <div className="group-card-menu-wrap" ref={open ? menuRef : undefined}>
                  <button
                    type="button"
                    className="group-card-menu-btn"
                    onClick={() => setMenuOpen(open ? null : group.id)}
                    aria-expanded={open}
                    title="Move group"
                  >
                    ⋯
                  </button>
                  {open && (
                    <div className="group-card-dropdown">
                      {allTabs
                        .filter((t) => t.key !== categoryOf(group.id))
                        .map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            className="group-card-dropdown-item"
                            onClick={() => moveGroup(group.id, t.key)}
                          >
                            <span>{t.icon}</span> Move to {t.label}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Create / Join (Active only) ── */}
      {tab === 'active' && (
        <div className="dash-actions">
          <button
            type="button"
            className={`dash-action-card${showCreate ? ' is-open' : ''}`}
            onClick={() => { setShowCreate(!showCreate); setShowJoin(false); }}
          >
            <span className="dash-action-icon">✦</span>
            <span className="dash-action-label">Create group</span>
            <span className="dash-action-chevron">{showCreate ? '▲' : '▼'}</span>
          </button>
          <button
            type="button"
            className={`dash-action-card${showJoin ? ' is-open' : ''}`}
            onClick={() => { setShowJoin(!showJoin); setShowCreate(false); }}
          >
            <span className="dash-action-icon">🔗</span>
            <span className="dash-action-label">Join with code</span>
            <span className="dash-action-chevron">{showJoin ? '▲' : '▼'}</span>
          </button>
        </div>
      )}

      {tab === 'active' && showCreate && (
        <CreateGroupCard
          onCreate={async (input) => {
            try {
              await createGroup(input);
              setShowCreate(false);
              addToast(pick([
                'Group created! Time to split some bills. 💰',
                'New group! The adventure begins. 🚀',
                'Created! Now invite your friends (and their wallets). 😄',
                'Group launched! Who owes whom starts… now.',
              ]));
            } catch (err) {
              addToast((err as Error).message, 'error');
            }
          }}
        />
      )}

      {tab === 'active' && showJoin && (
        <JoinGroupCard
          onJoin={async (code) => {
            try {
              const group = await joinGroup(code);
              if (!group) {
                addToast('No group with that code. Double-check and try again.', 'error');
                return;
              }
              setShowJoin(false);
              addToast(pick([
                "Joined! You're in. Welcome to the group. 🎉",
                "You're part of the crew now! 🤝",
                'Joined! Time to start splitting expenses.',
              ]));
            } catch (err) {
              addToast((err as Error).message, 'error');
            }
          }}
        />
      )}
    </main>
  );
}

/* ── Create group form ── */

function CreateGroupCard({ onCreate }: { onCreate: (input: { name: string; baseCurrency: string }) => void }) {
  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState(getDefaultCurrency);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await onCreate({ name: name.trim(), baseCurrency }); setName(''); }
    finally { setBusy(false); }
  }

  return (
    <form className="card dash-form-card" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Group name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekend Trip" required autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Base currency</span>
        <CurrencySelect value={baseCurrency} onChange={setBaseCurrency} />
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Creating…' : 'Create group'}
      </button>
    </form>
  );
}

/* ── Join group form ── */

function JoinGroupCard({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onJoin(code); }
    finally { setBusy(false); }
  }

  return (
    <form className="card dash-form-card" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Invite code</span>
        <input className="input chip-code" value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="7KQ4-B2XM" required autoFocus />
      </label>
      <button type="submit" className="btn btn-ghost" disabled={busy}>
        {busy ? 'Joining…' : 'Join group'}
      </button>
    </form>
  );
}