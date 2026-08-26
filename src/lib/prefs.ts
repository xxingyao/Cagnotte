import * as api from './api';
import { currencyInfo } from './currencies';

/**
 * User preferences: local-first, synced to the server.
 *
 * Reads are synchronous off localStorage so the UI never flashes a default.
 * Writes land locally at once and push to the server on a short debounce, so
 * dragging folders around doesn't fire a request per frame.
 */

const KEYS = {
  displayName: 'cagnotte:display-name',
  defaultCurrency: 'cagnotte:default-currency',
  currencies: 'cagnotte:currencies',
  theme: 'cagnotte:theme',
  groupCategories: 'cagnotte:group-categories',
  customCategories: 'cagnotte:custom-categories',
  investmentCategories: 'cagnotte:investment-categories',
} as const;
const OWNER_KEY = 'cagnotte:prefs-owner';
export const FALLBACK_CURRENCY = 'SGD';
export const PREFS_EVENT = 'cagnotte:prefs-changed';

export interface CustomCategory { id: string; label: string; order: number }



function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function emit() {
  try { window.dispatchEvent(new Event(PREFS_EVENT)); } catch {}
}

/* ── Server push, debounced and coalesced ── */

let pending: api.ApiPreferences = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function push(patch: api.ApiPreferences) {
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const body = pending;
    pending = {};
    timer = null;
    // Local already has it, so a failed sync costs nothing until the next
    // device switch. Logged rather than swallowed so it can't hide for weeks.
    api.putPreferences(body).catch((e: Error) => {
      console.warn('Could not sync preferences:', e.message);
    });
  }, 800);
}

function writeLocal(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

function set(key: string, value: string, patch: api.ApiPreferences) {
  writeLocal(key, value);
  emit();
  push(patch);
}

/* ── Pull from server ── */

let pulled = false;

/**
 * Called once from AppShell after sign-in. Server wins on a device that has
 * never seen these values; local wins when there's nothing stored server-side
 * yet, so an existing user's folders get uploaded rather than wiped.
 */
export async function syncFromServer(userId: string): Promise<void> {
  if (pulled) return;
  pulled = true;

  // Sign-out only clears the auth token, so another account's preferences can
  // still be sitting here. Drop them before syncing, or they'd leak into this
  // user's cache — and worse, get uploaded to their account below.
  const owner = readRaw(OWNER_KEY);
  if (owner && owner !== userId) {
    Object.values(KEYS).forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
    emit();
  }
  try { localStorage.setItem(OWNER_KEY, userId); } catch {}

  let remote: api.ApiPreferences;
  try {
    remote = await api.getPreferences();
  } catch (e) {
    // Local still works, so a silent catch here could hide a broken route for
    // weeks. This is the only trace it leaves.
    console.warn('Could not load preferences from the server:', (e as Error).message);
    return;
  }

  const isEmpty = !remote || Object.keys(remote).length === 0;
  if (isEmpty) {
    push({
      displayName: getDisplayName() || undefined,
      defaultCurrency: getDefaultCurrency(),
      currencies: getCurrencies(),
      theme: getTheme() ?? undefined,
      groupCategories: getGroupCategories(),
      customCategories: getCustomCategories(),
    });
    return;
  }

  if (remote.displayName !== undefined) writeLocal(KEYS.displayName, remote.displayName);
  if (remote.defaultCurrency) writeLocal(KEYS.defaultCurrency, remote.defaultCurrency);
  if (remote.currencies) writeLocal(KEYS.currencies, JSON.stringify(remote.currencies));
  if (remote.theme) writeLocal(KEYS.theme, remote.theme);
  if (remote.groupCategories) writeLocal(KEYS.groupCategories, JSON.stringify(remote.groupCategories));
  if (remote.customCategories) writeLocal(KEYS.customCategories, JSON.stringify(remote.customCategories));
  emit();
}

export function onPrefsChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PREFS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(PREFS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/* ── Display name ── */

export function getDisplayName(): string {
  return readRaw(KEYS.displayName) ?? '';
}

export function setDisplayName(name: string) {
  set(KEYS.displayName, name, { displayName: name });
}

/* ── Theme ── */

export type ThemeChoice = 'light' | 'dark';

export function getTheme(): ThemeChoice | null {
  const v = readRaw(KEYS.theme);
  return v === 'dark' || v === 'light' ? v : null;
}

export function setTheme(theme: ThemeChoice) {
  set(KEYS.theme, theme, { theme });
}

/* ── Currencies ── */

export function getDefaultCurrency(): string {
  const saved = readRaw(KEYS.defaultCurrency);
  return saved && currencyInfo(saved) ? saved : FALLBACK_CURRENCY;
}

export function setDefaultCurrency(code: string) {
  if (!currencyInfo(code)) return;
  set(KEYS.defaultCurrency, code, { defaultCurrency: code });
  const list = getCurrencies();
  if (!list.includes(code)) setCurrencies([...list, code]);
}

export function getCurrencies(): string[] {
  const fallback = [getDefaultCurrency()];
  const parsed = readJson<unknown>(KEYS.currencies, null);
  if (!Array.isArray(parsed)) return fallback;
  const valid = parsed.filter((c): c is string => typeof c === 'string' && !!currencyInfo(c));
  return valid.length ? valid : fallback;
}

export function setCurrencies(codes: string[]) {
  const unique = Array.from(new Set(codes.filter((c) => currencyInfo(c))));
  if (unique.length === 0) return;
  set(KEYS.currencies, JSON.stringify(unique), { currencies: unique });
}

export function addCurrency(code: string) {
  const list = getCurrencies();
  if (!list.includes(code)) setCurrencies([...list, code]);
}

export function removeCurrency(code: string): boolean {
  if (code === getDefaultCurrency()) return false;
  const list = getCurrencies();
  if (list.length <= 1) return false;
  setCurrencies(list.filter((c) => c !== code));
  return true;
}

/* ── Group folders ── */

export function getGroupCategories(): Record<string, string> {
  return readJson<Record<string, string>>(KEYS.groupCategories, {});
}

export function setGroupCategories(cats: Record<string, string>) {
  set(KEYS.groupCategories, JSON.stringify(cats), { groupCategories: cats });
}

export function getCustomCategories(): CustomCategory[] {
  const parsed = readJson<unknown>(KEYS.customCategories, []);
  return Array.isArray(parsed) ? (parsed as CustomCategory[]) : [];
}

export function setCustomCategories(cats: CustomCategory[]) {
  set(KEYS.customCategories, JSON.stringify(cats), { customCategories: cats });
}

const INV_CATS_KEY = 'cagnotte:investment-categories';

export interface InvCategory {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  custom?: boolean;
  hasUnits?: boolean;
}

export function getInvestmentCategories(): InvCategory[] {
  const parsed = readJson<unknown>(INV_CATS_KEY, null);
  return Array.isArray(parsed) ? (parsed as InvCategory[]) : [];
}

export function setInvestmentCategories(cats: InvCategory[]) {
  set(INV_CATS_KEY, JSON.stringify(cats), { investmentCategories: cats });
}