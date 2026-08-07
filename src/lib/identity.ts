const KEY = 'cagnotte.userId';

/**
 * A stable id for this browser, created on first use.
 *
 * Kept under its own localStorage key rather than inside the app data blob:
 * a data reset should not change who you are, and a sync from the server must
 * never be able to overwrite it.
 *
 * This identifies a *device*, not a person — the same human on a phone and a
 * laptop is two ids. Fixing that needs real accounts.
 */
export function getUserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;

    const created = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    window.localStorage.setItem(KEY, created);
    return created;
  } catch {
    // Private browsing with storage blocked: a per-session id still lets the
    // app work, it just won't be remembered.
    return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  }
}