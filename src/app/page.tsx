'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatars } from '@/components/Avatars';
import { useStore } from '@/components/StoreProvider';
import { CURRENCIES } from '@/lib/options';

type GroupTab = 'active' | 'planning' | 'archive';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface CustomCategory {
  id: string;
  label: string;
  order: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CAT_KEY = 'cagnotte:group-categories';
const CUSTOM_CAT_KEY = 'cagnotte:custom-categories';

function loadCats(): Record<string, GroupTab | string> {
  try {
    const raw = localStorage.getItem(CAT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCats(cats: Record<string, GroupTab | string>) {
  try { localStorage.setItem(CAT_KEY, JSON.stringify(cats)); } catch {}
}

function loadCustomCats(): CustomCategory[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomCats(cats: CustomCategory[]) {
  try { localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(cats)); } catch {}
}

const DEFAULT_TABS: { key: GroupTab; label: string; icon: string }[] = [
  { key: 'active', label: 'Active', icon: '🟢' },
  { key: 'planning', label: 'Planning', icon: '📋' },
  { key: 'archive', label: 'Archive', icon: '📦' },
];

export default function DashboardPage() {
  const { data, ready, user, createGroup, joinGroup } = useStore();
  const [tab, setTab] = useState<GroupTab | string>('active');
  const [cats, setCats] = useState<Record<string, GroupTab | string>>({});
  const [customCats, setCustomCats] = useState<CustomCategory[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [draggedTab, setDraggedTab] = useState<string | null>(null);

  function addToast(msg: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message: msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  useEffect(() => {
    if (ready && !user) window.location.href = '/login';
  }, [ready, user]);

  useEffect(() => {
    if (ready) {
      setCats(loadCats());
      setCustomCats(loadCustomCats());
    }
  }, [ready]);

  useEffect(() => {
    if (ready) saveCats(cats);
  }, [cats, ready]);

  useEffect(() => {
    if (ready) saveCustomCats(customCats);
  }, [customCats, ready]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  if (!ready) return <p className="sub">Loading…</p>;
  if (!user) return null;

  // Build all tabs (default + custom)
  const allTabs = [
    ...DEFAULT_TABS,
    ...customCats.sort((a, b) => a.order - b.order).map(c => ({ 
      key: c.id, 
      label: c.label, 
      icon: '📁' 
    }))
  ];

  // Count groups per category
  const counts: Record<string, number> = {};
  allTabs.forEach(t => counts[t.key] = 0);
  data.groups.forEach((g) => { 
    const cat = cats[g.id] || 'active';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const filtered = data.groups.filter((g) => (cats[g.id] || 'active') === tab);

  function addCategory() {
    if (!newCatLabel.trim()) return;
    const newCat: CustomCategory = {
      id: `cat-${Date.now()}`,
      label: newCatLabel.trim(),
      order: customCats.length
    };
    setCustomCats([...customCats, newCat]);
    setNewCatLabel('');
    setShowAddCategory(false);
    addToast(`"${newCat.label}" category created! 📁`);
  }

  function deleteCategory(catId: string) {
    setCustomCats(c => c.filter(x => x.id !== catId));
    addToast('Category deleted. Groups remain untouched.');
  }

  function moveGroup(groupId: string, to: GroupTab | string) {
    setCats((prev) => ({ ...prev, [groupId]: to }));
    setMenuOpen(null);
    const label = allTabs.find((t) => t.key === to)!.label;
    addToast(pick([
      `Moved to ${label}! Organization level: expert. 📂`,
      `Group shuffled to ${label}. Satisfying, isn't it? ✨`,
      `${label} it is! Your groups, your rules. 🎯`,
    ]));
  }

  function reorderCategory(id: string, direction: 'up' | 'down') {
    setCustomCats(cats => {
      const arr = [...cats];
      const idx = arr.findIndex(c => c.id === id);
      if (idx === -1) return arr;
      
      if (direction === 'up' && idx > 0) {
        [arr[idx].order, arr[idx - 1].order] = [arr[idx - 1].order, arr[idx].order];
        [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
      } else if (direction === 'down' && idx < arr.length - 1) {
        [arr[idx].order, arr[idx + 1].order] = [arr[idx + 1].order, arr[idx].order];
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      }
      return arr;
    });
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
        {allTabs.map((t, idx) => {
          const isCustom = customCats.some(c => c.id === t.key);
          return (
            <div key={t.key} className="dash-tab-item">
              <button
                type="button"
                className={`dash-tab${tab === t.key ? ' is-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="dash-tab-icon">{t.icon}</span>
                <span className="dash-tab-label">{t.label}</span>
                <span className="dash-tab-count">{counts[t.key] || 0}</span>
              </button>
              {isCustom && (
                <div className="dash-tab-controls">
                  <button
                    type="button"
                    className="dash-tab-control-btn"
                    onClick={() => reorderCategory(t.key, 'up')}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="dash-tab-control-btn"
                    onClick={() => reorderCategory(t.key, 'down')}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="dash-tab-control-btn dash-tab-delete"
                    onClick={() => deleteCategory(t.key)}
                    title="Delete category"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="dash-tab-add"
          onClick={() => setShowAddCategory(!showAddCategory)}
          title="Add category"
        >
          +
        </button>
      </div>

      {/* ── Add category form ── */}
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
            <button type="button" className="btn" onClick={addCategory}>
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowAddCategory(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Group list ── */}
      {filtered.length === 0 ? (
        <div className="dash-empty">
          <div className="dash-empty-icon">
            {tab === 'active' ? '🏠' : tab === 'planning' ? '📋' : '📦'}
          </div>
          <p>
            {tab === 'active'
              ? 'No active groups — start one below or move one here.'
              : tab === 'planning'
                ? 'No groups planned yet. Move a group here to plan ahead.'
                : 'Nothing archived. Move inactive groups here to tidy up.'}
          </p>
        </div>
      ) : (
        <ul className="group-list">
          {filtered.map((group) => (
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
              <div className="group-card-menu-wrap">
                <button
                  type="button"
                  className="group-card-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === group.id ? null : group.id);
                  }}
                  title="Move group"
                >
                  ⋯
                </button>
                {menuOpen === group.id && (
                  <div className="group-card-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                    {allTabs.filter((t) => t.key !== (cats[group.id] || 'active')).map((t) => (
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
          ))}
        </ul>
      )}

      {/* ── Create / Join (only in Active tab) ── */}
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

      {showCreate && (
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

      {showJoin && (
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

function CreateGroupCard({ onCreate }: { onCreate: (input: { name: string; baseCurrency: string }) => void }) {
  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState(() => {
    try { return localStorage.getItem('cagnotte:default-currency') || 'SGD'; }
    catch { return 'SGD'; }
  });
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
        <select className="select" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Creating…' : 'Create group'}
      </button>
    </form>
  );
}

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