'use client';
import * as api from '@/lib/api';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyData, loadData, saveData } from '@/lib/storage';
import type { AppData, Expense, Group, Member } from '@/lib/types';

interface Store {
  data: AppData;
  ready: boolean;
  createGroup(input: { name: string; baseCurrency: string; yourName: string }): Promise<Group>;
  joinGroup(inviteCode: string, yourName: string): Promise<Group | null>;
  syncGroup (groupId: string): Promise<void>;
  addExpense(input: Omit<Expense, 'id'>): Promise<void>;
  setBudget(groupId: string, month: string, limitMinor: number): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);

  // Load AFTER the first render. Reading localStorage during render would make
  // the server-rendered HTML and the client disagree — React calls that a
  // hydration mismatch and it produces confusing, intermittent bugs.
  useEffect(() => {
    setData(loadData());
    setReady(true);
  }, []);

  // Save on every change, but not before the initial load — that would
  // overwrite real saved data with the empty starting state.
  useEffect(() => {
    if (ready) saveData(data);
  }, [data, ready]);

  // Refreshes one group and its expenses from the server. Both are needed:
  // expenses so new spending shows up, the group itself so members who joined
  // on another device appear here.
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
    syncGroup,

      async createGroup({ name, baseCurrency, yourName }) {
      // One member object, one id — sent to the server and kept locally, so
      // payerId means the same thing on every device.
      const me: Member = { id: newId(), name: yourName.trim() || 'You' };
      const { groupId, inviteCode } = await api.createGroup(name.trim(), baseCurrency, [me]);

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

      // Already on this device: adopt the server's copy rather than adding a
      // duplicate member every time the code is re-entered.
      if (data.groups.some((g) => g.id === found.id)) {
        setData((d) => ({
          ...d,
          groups: d.groups.map((g) => (g.id === found.id ? found : g)),
        }));
        return found;
      }

      const me: Member = { id: newId(), name: yourName.trim() || 'Member' };
      const updated = await api.joinGroup(found.id, me);
      setData((d) => ({ ...d, groups: [...d.groups, updated] }));
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