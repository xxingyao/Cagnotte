'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useStore } from './StoreProvider';

const NAV_ITEMS = [
  { href: '/', label: 'Your groups', icon: '🏠' },
  { href: '/friends', label: 'Friends', icon: '👥' },
  { href: '/investments', label: 'Investments', icon: '📈' },
  { href: '/assets', label: 'Assets', icon: '🏦' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

const COLLAPSE_KEY = 'cagnotte:sidebar-collapsed';
const NAME_KEY = 'cagnotte:display-name';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const accountRef = useRef<HTMLDivElement>(null);

  // Read the saved preference after mount only — doing it during the initial
  // render would make the server-rendered markup (which knows nothing of
  // localStorage) disagree with the client's first render and trigger a
  // hydration warning. Desktop-only anyway; CSS never applies this on mobile.
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    setDisplayName(localStorage.getItem(NAME_KEY) || '');
  }, []);

  // Click anywhere outside the account button/menu closes it, same as any
  // normal dropdown — without this it only ever closes by clicking the
  // button again.
  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClick(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountMenuOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const shownName = displayName || user?.name || 'Cagnotte';

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
          <div className="sidebar-account-wrap" ref={accountRef}>
            <button
              type="button"
              className="sidebar-account"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-expanded={accountMenuOpen}
            >
              <span className="sidebar-account-badge">
                <Image
                  src="/logo.png"
                  alt=""
                  width={26}
                  height={26}
                  className="wordmark-dot"
                  priority
                />
              </span>
              <span className="sidebar-account-text">
                <span className="sidebar-user-name">{shownName}</span>
              </span>
              <span className="sidebar-account-chevron" aria-hidden="true">⌄</span>
            </button>
            {accountMenuOpen && (
              <div className="sidebar-account-menu">
                <button
                  type="button"
                  className="sidebar-account-menu-item"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    logout();
                  }}
                >
                  <span className="sidebar-menu-icon" aria-hidden="true">🚪</span>
                  Sign out
                </button>
              </div>
            )}
          </div>
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
              title={item.label}
            >
              <span className="sidebar-link-icon" aria-hidden="true">{item.icon}</span>
              <span className="sidebar-link-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Only visible on desktop via CSS — mobile uses the drawer's
            open/close instead of a collapsed icon rail. */}
        <div className="sidebar-foot">
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <path
                d="M12.5 4.5 7 10l5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}