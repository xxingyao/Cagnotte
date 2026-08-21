'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useStore } from './StoreProvider';
import { Sidebar } from './Sidebar';
import { useEffect } from 'react';


export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useStore();
  // Apply saved theme preference on mount (before first paint would be ideal,
  // but a useEffect is close enough — the flash is barely visible).
  useEffect(() => {
    try {
      const theme = localStorage.getItem('cagnotte:theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
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