import type { AppData } from './types';

const KEY = 'cagnotte.v1';

export const emptyData: AppData = { version: 1, groups: [], expenses: [], budgets: [] };

export function loadData(): AppData {
  if (typeof window === 'undefined') return emptyData;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyData;

    const parsed = JSON.parse(raw) as AppData;
    if (parsed?.version !== 1) return emptyData;

    return {
      version: 1,
      groups: parsed.groups ?? [],
      expenses: parsed.expenses ?? [],
      budgets: parsed.budgets ?? [],
    };
  } catch {
    // Corrupt or unreadable: start clean rather than crash on every page load.
    return emptyData;
  }
}

export function saveData(data: AppData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or private browsing: the app keeps working, it just won't persist.
  }
}