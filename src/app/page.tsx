'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatars } from '@/components/Avatars';
import { useStore } from '@/components/StoreProvider';
import { CURRENCIES } from '@/lib/options';

export default function DashboardPage() {
  const { data, ready, createGroup, joinGroup } = useStore();

  if (!ready) return <p className="sub">Loading…</p>;

  return (
    <main>
      <h1 className="page-title">Your groups</h1>
      <p className="page-sub">
        {data.groups.length === 0
          ? 'No groups yet — start one below.'
          : `${data.groups.length} shared ${data.groups.length === 1 ? 'pot' : 'pots'}.`}
      </p>

      {data.groups.length > 0 && (
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
  const [yourName, setYourName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name, baseCurrency, yourName });
    setName('');
    setYourName('');
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
        <span className="field-label">Your name</span>
        <input
          className="input"
          value={yourName}
          onChange={(e) => setYourName(e.target.value)}
          placeholder="Mei"
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
      <button type="submit" className="btn">Create group</button>
    </form>
  );
}

function JoinGroupCard({ onJoin }: { onJoin: ReturnType<typeof useStore>['joinGroup'] }) {
  const [code, setCode] = useState('');
  const [yourName, setYourName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const group = onJoin(code, yourName);
    if (!group) {
      setError('No group with that code on this device.');
      return;
    }
    setError(null);
    setCode('');
    setYourName('');
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
      <label className="field">
        <span className="field-label">Your name</span>
        <input
          className="input"
          value={yourName}
          onChange={(e) => setYourName(e.target.value)}
          placeholder="Tomás"
        />
      </label>
      {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
      <button type="submit" className="btn btn-ghost">Join with code</button>
    </form>
  );
}