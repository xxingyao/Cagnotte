'use client';

import * as api from '@/lib/api';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyData, loadData, saveData } from '@/lib/storage';
import { getUserId } from '@/lib/identity';
import type { AppData, Expense, Group, Member } from '@/lib/types';

interface Store {
  data: AppData;
  /** False until localStorage has been read. Render a placeholder while false. */
  ready: boolean;
  /** This browser's id. Also the member id representing you in every group. */
  userId: string;
  createGroup(input: { name: string; baseCurrency: string; yourName: string }): Promise<Group>;
  joinGroup(inviteCode: string, yourName: string): Promise<Group | null>;
  syncGroup(groupId: string): Promise<void>;
  addExpense(input: Omit<Expense, 'id'>): Promise<void>;
  setBudget(groupId: string, month: string, limitMinor: number): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState('');

  // Cache first so the page paints immediately, then the server's list replaces
  // it. This is what makes the dashboard survive a cleared cache: the groups
  // come back from user-groups rather than from this browser.
  //
  // Reading localStorage during render instead would make the server-rendered
  // HTML and the client disagree — a hydration mismatch, which produces
  // confusing intermittent bugs.
  useEffect(() => {
    const id = getUserId();
    setUserId(id);
    setData(loadData());
    setReady(true);

    api
      .listUserGroups(id)
      .then((groups) => setData((d) => ({ ...d, groups })))
      .catch(() => {
        // Offline or server down: the cached list is still usable.
      });
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
    const [group, expenses] = await Promise.all([
      api.getGroup(groupId),
      api.getExpenses(groupId),
    ]);
    setData((d) => ({
      ...d,
      groups: d.groups.map((g) => (g.id === groupId ? group : g)),
      expenses: [...d.expenses.filter((e) => e.groupId !== groupId), ...expenses],
    }));
  }, []);

  const store: Store = {
    data,
    ready,
    userId,
    syncGroup,

    async createGroup({ name, baseCurrency, yourName }) {
      // Your member id IS this device's id, so "which member am I" needs no
      // extra bookkeeping anywhere in the app.
      const me: Member = { id: userId, name: yourName.trim() || 'You' };
      const { groupId, inviteCode } = await api.createGroup(
        name.trim(),
        baseCurrency,
        userId,
        me.name,
      );

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

    async joinGroup(inviteCode, yourName) {
      const code = inviteCode.trim().toUpperCase();
      const found = await api.getGroupByCode(code);
      if (!found) return null;

      // The server dedupes by userId, so re-entering your own code is safe —
      // it returns the group unchanged rather than adding you twice.
      const updated = await api.joinGroup(found.id, userId, yourName.trim() || 'Member');

      setData((d) => ({
        ...d,
        groups: d.groups.some((g) => g.id === updated.id)
          ? d.groups.map((g) => (g.id === updated.id ? updated : g))
          : [...d.groups, updated],
      }));
      return updated;
    },

    async addExpense(input) {
      // Take the server's id rather than minting our own, so the local row and
      // the DynamoDB row are the same record once a sync overwrites it.
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
      setData((d) => ({ ...d, expenses: [...d.expenses, { ...input, id: expenseId }] }));
    },

    async setBudget(groupId, month, limitMinor) {
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