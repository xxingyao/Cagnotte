'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStore } from './StoreProvider';

const NAV_ITEMS = [
  { href: '/', label: 'Your groups', icon: '🏠' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile-only slim bar with the hamburger — hidden on desktop by CSS. */}
      <div className="mobile-topbar">
        <button
          type="button"
          className="hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <span /><span /><span />
        </button>
        <Link href="/" className="wordmark">
          <Image src="/logo.png" alt="" width={22} height={22} className="wordmark-dot" priority />
          Cagnotte
        </Link>
      </div>

      {/* Only exists on mobile, only while the drawer is open. */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar${mobileOpen ? ' is-open' : ''}`}>
        <div className="sidebar-head">
          <Link href="/" className="wordmark" onClick={() => setMobileOpen(false)}>
            <Image src="/logo.png" alt="" width={22} height={22} className="wordmark-dot" priority />
            Cagnotte
          </Link>
          {/* Only visible on mobile via CSS — desktop's sidebar has nothing to close. */}
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${pathname === item.href ? ' is-active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user-name">{user?.name || user?.email}</div>
          <div className="sidebar-user-email">{user?.email}</div>
          <button type="button" className="sidebar-signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}