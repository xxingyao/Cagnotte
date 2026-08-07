'use client';
import * as api from '@/lib/api';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyData, loadData, saveData } from '@/lib/storage';
import type { AppData, Expense, Group } from '@/lib/types';

interface Store {
  data: AppData;
  ready: boolean;
  createGroup(input: { name: string; baseCurrency: string; yourName: string }): Promise<Group>;
  joinGroup(inviteCode: string, yourName: string): Promise<Group | null>;
  addExpense(input: Omit<Expense, 'id'>): Promise<void>;
  setBudget(groupId: string, month: string, limitMinor: number): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function newInviteCode(): string {
  // No 0/O/1/I — codes get read aloud and mistyped.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
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

  const store: Store = {
    data,
    ready,

    async createGroup({ name, baseCurrency, yourName }) {
      try {
        const result = await api.createGroup(name.trim(), baseCurrency, [newId()]);
        const group: Group = {
          id: result.groupId,
          name: name.trim(),
          baseCurrency,
          inviteCode: result.inviteCode,
          members: [{ id: newId(), name: yourName.trim() || 'You' }],
        };
        setData((d) => ({ ...d, groups: [...d.groups, group] }));
        return group;
      } catch (error) {
        console.error('Failed to create group:', error);
        throw error;
      }
    },

    async joinGroup(inviteCode, yourName) {
      const code = inviteCode.trim().toUpperCase();
      const group = data.groups.find((g) => g.inviteCode === code);
      if (!group) return null;

      const member = { id: newId(), name: yourName.trim() || 'Member' };
      setData((d) => ({
        ...d,
        groups: d.groups.map((g) =>
          g.id === group.id ? { ...g, members: [...g.members, member] } : g,
        ),
      }));
      return group;
    },

    async addExpense(input) {
      try {
        await api.addExpense(input.groupId, input.description, input.payerId, input.amountMinor, input.currency, input.category, input.date);
        setData((d) => ({ ...d, expenses: [...d.expenses, { ...input, id: newId() }] }));
      } catch (error) {
        console.error('Failed to add expense:', error);
        throw error;
      }
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