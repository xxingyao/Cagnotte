'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatars } from '@/components/Avatars';
import { useStore } from '@/components/StoreProvider';
import { CURRENCIES } from '@/lib/options';

export default function DashboardPage() {
  const { data, ready, user, login, logout, createGroup, joinGroup } = useStore();

  if (!ready) return <p className="sub">Loading…</p>;

  if (!user) {
    return (
      <main>
        <h1 className="page-title">Cagnotte</h1>
        <p className="page-sub">
          Shared budgets and expense splitting. Sign in to see your groups on any device.
        </p>
        <button type="button" className="btn" onClick={() => login()}>
          Sign in or create an account
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1 className="page-title">Your groups</h1>
      <p className="page-sub">
        {user.name || user.email} ·{' '}
        <button
          type="button"
          className="sub"
          onClick={logout}
          style={{ background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
        >
          sign out
        </button>
      </p>

      {data.groups.length === 0 ? (
        <p className="sub">No groups yet — start one below.</p>
      ) : (
        <ul className="group-list">
          {data.groups.map((group) => (
            <li key={group.id}>
              <Link href={`/groups/${group.id}`} className="group-card">
                <div className="group-card-main">
                  <div className="group-card-name">{group.name}</div>
                  <div className="group-card-meta">
                    {group.members.length}{' '}
                    {group.members.length === 1 ? 'member' : 'members'}
                  </div>
                </div>
                <Avatars names={group.members.map((m) => m.name)} />
                <span className="chip">{group.baseCurrency}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <CreateGroupCard onCreate={createGroup} />
        <JoinGroupCard onJoin={joinGroup} />
      </div>
    </main>
  );
}

function CreateGroupCard({ onCreate }: { onCreate: ReturnType<typeof useStore>['createGroup'] }) {
  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await onCreate({ name, baseCurrency });
      setName('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card-title">Start a group</h2>
      <label className="field">
        <span className="field-label">Group name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lisbon flat"
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Base currency</span>
        <select
          className="select"
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
        >
          {CURRENCIES.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </select>
      </label>
      {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Creating…' : 'Create group'}
      </button>
    </form>
  );
}

function JoinGroupCard({ onJoin }: { onJoin: ReturnType<typeof useStore>['joinGroup'] }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Without the await, `group` would be the Promise itself — always truthy —
  // so a wrong code would silently look like it worked.
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const group = await onJoin(code);
      if (!group) {
        setError('No group with that code.');
        return;
      }
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card-title">Join a group</h2>
      <label className="field">
        <span className="field-label">Invite code</span>
        <input
          className="input chip-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="7KQ4-B2XM"
          required
        />
      </label>
      {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
      <button type="submit" className="btn btn-ghost" disabled={busy}>
        {busy ? 'Joining…' : 'Join with code'}
      </button>
    </form>
  );
}