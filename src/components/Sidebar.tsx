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

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

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

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/" className="wordmark">
          <Image src="/logo.png" alt="" width={22} height={22} className="wordmark-dot" priority />
          Cagnotte
        </Link>
      </div>

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
              <Image
                src="/logo.png"
                alt=""
                width={26}
                height={26}
                className="wordmark-dot"
                priority
              />
              <span className="sidebar-account-text">
                <span className="sidebar-user-name">
                  {(() => {
                    try { return localStorage.getItem('cagnotte:display-name') || user?.name || 'Cagnotte'; }
                    catch { return user?.name || 'Cagnotte'; }
                  })()}
                </span>
              </span>
              <span className="sidebar-account-chevron" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                  <path
                    d="M5 7.5 10 12.5 15 7.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
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
                  <span className="sidebar-menu-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                      <path d="M7 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M13 14l4-4-4-4M17 10H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  Sign out
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
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

        <div className="sidebar-foot">
          <button
            type="button"
            className="icon-btn sidebar-collapse-toggle"
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