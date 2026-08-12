'use client';

import * as api from '@/lib/api';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyData, loadData, saveData } from '@/lib/storage';
import { completeLogin, currentUser, login, logout, type User } from '@/lib/auth';
import type { AppData, Expense, Group, Member } from '@/lib/types';

interface Store {
  data: AppData;
  /** False until localStorage has been read. Render a placeholder while false. */
  ready: boolean;
  /** Cognito's `sub`. Also the member id representing you in every group. */
  userId: string;
  user: User | null;
  login(): Promise<void>;
  logout(): void;
  createGroup(input: { name: string; baseCurrency: string }): Promise<Group>;
  joinGroup(inviteCode: string): Promise<Group | null>;
  syncGroup(groupId: string): Promise<void>;
  // baseAmountMinor/rate come from a currency conversion the Lambda performs
  // — the client can't supply them, same reason it can't supply an id.
  addExpense(input: Omit<Expense, 'id' | 'baseAmountMinor' | 'rate'>): Promise<void>;  
  deleteExpense(groupId: string, expenseId: string): Promise<void>;
  setBudget(groupId: string, month: string, limitMinor: number): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Derived, not state. Held separately it would need its own setter and could
  // drift out of step with `user` — which is exactly what went wrong before.
  const userId = user?.id ?? '';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Handles the ?code= redirect back from the Hosted UI, if that's why
      // we're here. Harmless on a normal load.
      await completeLogin();
      if (cancelled) return;

      const signedIn = currentUser();
      setUser(signedIn);
      setData(loadData());
      setReady(true);

      if (!signedIn) return;

      // Cache paints first, then the server's list replaces it — this is what
      // makes the dashboard survive a cleared cache.
      api
        .listUserGroups()
        .then((groups) => {
          if (!cancelled) setData((d) => ({ ...d, groups }));
        })
        .catch((error: Error) => {
          // The cached list still shows, so a silent catch here can hide a
          // broken route for weeks. This is the only trace it left.
          console.warn('Could not refresh groups from the server:', error.message);
        });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Save on every change, but not before the initial load — that would
  // overwrite real saved data with the empty starting state.
  useEffect(() => {
    if (ready) saveData(data);
  }, [data, ready]);

  // Refreshes one group and its expenses from the server. Both are needed:
  // expenses so new spending shows up, the group itself so members who joined
  // on another device appear here.
  //
  // useCallback matters: `store` is rebuilt on every render, so an unmemoised
  // version would be a new function each time and any useEffect depending on it
  // would re-run forever.
  const syncGroup = useCallback(async (groupId: string) => {
    const [group, expenses, budgets] = await Promise.all([
      api.getGroup(groupId),
      api.getExpenses(groupId),
      api.getBudgets(groupId),
    ]);
    setData((d) => ({
      ...d,
      groups: d.groups.map((g) => (g.id === groupId ? group : g)),
      expenses: [...d.expenses.filter((e) => e.groupId !== groupId), ...expenses],
      budgets: [...d.budgets.filter((b) => b.groupId !== groupId), ...budgets],
    }));
  }, []);

  const store: Store = {
    data,
    ready,
    userId,
    user,
    login,
    logout,
    syncGroup,

    async createGroup({ name, baseCurrency }) {
      if (!user) throw new Error('You need to be signed in to create a group.');

      // Your member id IS your Cognito sub, and the display name comes from the
      // account — so you're the same person in every group, on every device.
      const me: Member = { id: user.id, name: user.name || user.email || 'You' };
      const { groupId, inviteCode } = await api.createGroup(name.trim(), baseCurrency, me.name);

      const group: Group = {
        id: groupId,
        name: name.trim(),
        baseCurrency,
        inviteCode,
        members: [me],
      };
      setData((d) => ({ ...d, groups: [...d.groups, group] }));
      return group;
    },

    async joinGroup(inviteCode) {
      if (!user) throw new Error('You need to be signed in to join a group.');

      const code = inviteCode.trim().toUpperCase();
      const found = await api.getGroupByCode(code);
      if (!found) return null;

      // The server dedupes by the id in your token, so re-entering your own
      // code is safe — it returns the group unchanged rather than adding you
      // twice.
      const updated = await api.joinGroup(found.id, user.name || user.email || 'Member');

      setData((d) => ({
        ...d,
        groups: d.groups.some((g) => g.id === updated.id)
          ? d.groups.map((g) => (g.id === updated.id ? updated : g))
          : [...d.groups, updated],
      }));
      return updated;
    },

    async addExpense(input) {
      const { expenseId } = await api.addExpense(
        input.groupId,
        input.description,
        input.payerId,
        input.amountMinor,
        input.currency,
        input.category,
        input.date,
        input.splitBetween,
      );
      setData((d) => ({
        ...d,
        expenses: [
          ...d.expenses,
          // Placeholder until the next sync brings back the server's real
          // converted amount. The group page already calls syncGroup right
          // after this resolves, so this is only visible for an instant.
          { ...input, id: expenseId, baseAmountMinor: null, rate: null },
        ],
      }));
    },

    async deleteExpense(groupId, expenseId) {
      // Server first: dropping it locally before the call succeeds would make a
      // failed delete look like it worked until the next sync brought it back.
      await api.deleteExpense(groupId, expenseId);
      setData((d) => ({
        ...d,
        expenses: d.expenses.filter((e) => e.id !== expenseId),
      }));
    },

    async setBudget(groupId, month, limitMinor) {
      // Server first: updating local state before the call succeeds would make
      // a failed save look like it worked until the next sync overwrote it.
      await api.setBudget(groupId, month, limitMinor);
      setData((d) => ({
        ...d,
        budgets: [
          ...d.budgets.filter((b) => !(b.groupId === groupId && b.month === month)),
          { groupId, month, limitMinor },
        ],
      }));
    },
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>.');
  return store;
}