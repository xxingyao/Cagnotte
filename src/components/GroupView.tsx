'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getClient } from '@/lib/amplify';
import { useMe } from '@/hooks/useMe';
import { toRateTable, type RateTable } from '@/lib/fx';
import { computeBalances, simplifyDebts, monthOf } from '@/lib/balances';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { BudgetPanel } from './BudgetPanel';
import { BalancesPanel } from './BalancesPanel';
import type { Schema } from '../../amplify/data/resource';

type Group = Schema['Group']['type'];
type Membership = Schema['Membership']['type'];
type Expense = Schema['Expense']['type'];
type Split = Schema['Split']['type'];

export function GroupView({ groupId }: { groupId: string }) {
  const { me } = useMe();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [rates, setRates] = useState<RateTable>({});
  const [error, setError] = useState<string | null>(null);

  const month = monthOf(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const client = getClient();

    client.models.Group.get({ id: groupId }).then(({ data, errors }) => {
      if (errors?.length) {
        setError("You don't have access to this group, or it no longer exists.");
        return;
      }
      setGroup(data);
    });

    client.models.Rate.list({ limit: 200 }).then(({ data }) => {
      setRates(toRateTable(data ?? []));
    });

    // Live subscriptions — this is what makes an expense added by a flatmate
    // appear on everyone else's screen straight away.
    const subscriptions = [
      client.models.Membership.observeQuery({
        filter: { groupId: { eq: groupId } },
      }).subscribe({ next: ({ items }) => setMembers(items) }),

      client.models.Expense.observeQuery({
        filter: { groupId: { eq: groupId } },
      }).subscribe({ next: ({ items }) => setExpenses(items) }),

      client.models.Split.observeQuery({
        filter: { groupId: { eq: groupId } },
      }).subscribe({ next: ({ items }) => setSplits(items) }),
    ];

    return () => subscriptions.forEach((s) => s.unsubscribe());
  }, [groupId]);

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  const nameOf = useMemo(() => {
    const names = new Map(members.map((m) => [m.userId, m.displayName]));
    return (userId: string) => names.get(userId) ?? 'Someone';
  }, [members]);

  const balances = useMemo(
    () =>
      computeBalances({
        expenses: expenses.map((e) => ({
          id: e.id,
          payerId: e.payerId,
          amountInBase: e.amountInBase,
        })),
        splits: splits.map((s) => ({
          expenseId: s.expenseId,
          userId: s.userId,
          shareAmount: s.shareAmount,
        })),
        memberIds,
      }),
    [expenses, splits, memberIds]
  );

  const settlements = useMemo(() => simplifyDebts(balances), [balances]);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => monthOf(e.date) === month),
    [expenses, month]
  );

  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date)),
    [expenses]
  );

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Back to your groups
        </Link>
      </main>
    );
  }

  if (!group || !me) {
    return <main className="p-6 text-slate-500">Loading group…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-sm text-slate-500 underline">
          ← All groups
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{group.name}</h1>
        <p className="text-sm text-slate-500">
          {members.length} {members.length === 1 ? 'member' : 'members'} · everything shown in{' '}
          {group.baseCurrency} · invite code{' '}
          <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">{group.inviteCode}</code>
        </p>
      </header>

      <div className="space-y-6">
        <BudgetPanel
          groupId={group.id}
          groupKey={group.groupKey}
          baseCurrency={group.baseCurrency}
          month={month}
          monthExpenses={monthExpenses}
        />

        <ExpenseForm
          group={group}
          members={members}
          me={me}
          rates={rates}
        />

        <BalancesPanel
          balances={balances}
          settlements={settlements}
          baseCurrency={group.baseCurrency}
          nameOf={nameOf}
          meSub={me.sub}
        />

        <ExpenseList
          expenses={sortedExpenses}
          baseCurrency={group.baseCurrency}
          nameOf={nameOf}
        />
      </div>
    </main>
  );
}
