'use client';

import { useStore } from '@/components/StoreProvider';

export default function SettingsPage() {
  const { user, ready } = useStore();

  if (!ready) return <p className="sub">Loading…</p>;
  if (!user) return null;

  return (
    <main>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Signed in as {user.email}</p>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Coming soon</h2>
        </div>
        <p className="sub">
          Profile picture, display name, default currency, theme, friends, and account
          deletion will live here next.
        </p>
      </div>
    </main>
  );
}