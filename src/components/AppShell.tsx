'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { useStore } from './StoreProvider';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useStore();

  // Apply the saved theme on every page, not just Settings.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cagnotte:theme');
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.setAttribute('data-theme', saved);
      }
    } catch {}
  }, []);

  // Not signed in (or still loading): no nav — there's nothing to navigate to
  // yet. Just the wordmark above whatever the page itself renders (the
  // sign-in screen).
  if (!ready || !user) {
    return (
      <div className="shell">
        <div className="signed-out-topbar">
          <Link href="/" className="wordmark">
            <Image src="/logo.png" alt="" width={22} height={22} className="wordmark-dot" priority />
            Cagnotte
          </Link>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <div className="shell">{children}</div>
      </div>
    </div>
  );
}