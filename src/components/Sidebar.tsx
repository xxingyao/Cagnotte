'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore } from './StoreProvider';

const NAV_ITEMS = [
  { href: '/', label: 'Your groups', icon: '🏠' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

const COLLAPSE_KEY = 'cagnotte:sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Read the saved preference after mount only — doing it during the initial
  // render would make the server-rendered markup (which knows nothing of
  // localStorage) disagree with the client's first render and trigger a
  // hydration warning. Desktop-only anyway; CSS never applies this on mobile.
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

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

      <aside
        className={`sidebar${mobileOpen ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
      >
        <div className="sidebar-head">
          <Link href="/" className="wordmark" onClick={() => setMobileOpen(false)}>
            <Image src="/logo.png" alt="" width={22} height={22} className="wordmark-dot" priority />
            <span className="wordmark-text">Cagnotte</span>
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
          {/* Only visible on desktop via CSS — mobile uses the drawer's
              open/close instead of a collapsed icon rail. */}
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            ‹
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${pathname === item.href ? ' is-active' : ''}`}
              onClick={() => setMobileOpen(false)}
              title={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="sidebar-link-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || user?.email}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button type="button" className="sidebar-signout" onClick={logout} title="Sign out">
            <span aria-hidden="true">🚪</span>
            <span className="sidebar-link-label">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}