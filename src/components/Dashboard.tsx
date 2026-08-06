'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'aws-amplify/auth';
import { getClient } from '@/lib/amplify';
import { useMe, refreshGroupClaims } from '@/hooks/useMe';
import { CURRENCIES } from '@/lib/currencies';
import type { Schema } from '../../amplify/data/resource';

type Group = Schema['Group']['type'];

export function Dashboard() {
  const { me, loading: loadingMe } = useMe();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    if (!me) return;
    const client = getClient();

    // observeQuery keeps this list live: a group created on another device shows
    // up here without a refresh.
    const sub = client.models.Membership.observeQuery({
      filter: { userId: { eq: me.sub } },
    }).subscribe({
      next: async ({ items }) => {
        const results = await Promise.all(
          items.map((membership) => client.models.Group.get({ id: membership.groupId }))
        );
        setGroups(results.map((r) => r.data).filter((g): g is Group => Boolean(g)));
        setLoadingGroups(false);
      },
      error: () => setLoadingGroups(false),
    });

    return () => sub.unsubscribe();
  }, [me]);

  if (loadingMe) return <Centered>Loading…</Centered>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cagnotte 💶</h1>
          <p className="text-sm text-slate-500">Signed in as {me?.displayName}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-white"
        >
          Sign out
        </button>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Your groups</h2>
        {loadingGroups ? (
          <p className="text-slate-500">Loading groups…</p>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
            No groups yet. Create one below, or join with an invite code.
          </p>
        ) : (
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-slate-500">{group.baseCurrency}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateGroupCard displayName={me?.displayName ?? ''} />
        <JoinGroupCard displayName={me?.displayName ?? ''} />
      </div>
    </main>
  );
}

function CreateGroupCard({ displayName }: { displayName: string }) {
  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { errors } = await getClient().mutations.createGroup({
        name,
        baseCurrency,
        displayName,
      });
      if (errors?.length) throw new Error(errors[0].message);
      // The new group lives behind a Cognito group claim the current token
      // predates, so the token must be re-minted before its data is readable.
      await refreshGroupClaims();
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the group.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 font-medium">Start a group</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Lisbon flat, Semester 2…"
        required
        className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      <label className="mb-3 block text-sm text-slate-600">
        Base currency
        <select
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy}
        className="w-full rounded-lg bg-ink py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create group'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}

function JoinGroupCard({ displayName }: { displayName: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { errors } = await getClient().mutations.joinGroup({
        inviteCode: code,
        displayName,
      });
      if (errors?.length) throw new Error(errors[0].message);
      await refreshGroupClaims();
      setCode('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join that group.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 font-medium">Join a group</h3>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="7KQ4-B2XM"
        required
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tracking-widest"
      />
      <button
        disabled={busy}
        className="w-full rounded-lg bg-ink py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Joining…' : 'Join with code'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center text-slate-500">{children}</main>
  );
}
