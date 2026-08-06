'use client';

import { useEffect, useState } from 'react';
import { getClient } from '@/lib/amplify';
import { budgetProgress } from '@/lib/balances';
import { formatMoney, parseAmount } from '@/lib/money';
import type { Schema } from '../../amplify/data/resource';

type Expense = Schema['Expense']['type'];
type Budget = Schema['Budget']['type'];

export function BudgetPanel({
  groupId,
  groupKey,
  baseCurrency,
  month,
  monthExpenses,
}: {
  groupId: string;
  groupKey: string;
  baseCurrency: string;
  month: string;
  monthExpenses: Expense[];
}) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = getClient()
      .models.Budget.observeQuery({
        filter: { and: [{ groupId: { eq: groupId } }, { month: { eq: month } }] },
      })
      .subscribe({ next: ({ items }) => setBudget(items[0] ?? null) });
    return () => sub.unsubscribe();
  }, [groupId, month]);

  const spent = monthExpenses.reduce((sum, expense) => sum + expense.amountInBase, 0);
  const progress = budgetProgress(spent, budget?.limitInBase ?? 0);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const limitInBase = parseAmount(draft, baseCurrency);
      const client = getClient();
      if (budget) {
        await client.models.Budget.update({ id: budget.id, limitInBase });
      } else {
        await client.models.Budget.create({ groupId, groupKey, month, limitInBase });
      }
      setEditing(false);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the budget.');
    }
  }

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const barColour = progress.overspent
    ? 'bg-red-500'
    : progress.nearingLimit
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium">{monthLabel}</h2>
        <button
          onClick={() => {
            setEditing((was) => !was);
            setDraft('');
          }}
          className="text-sm text-slate-500 underline"
        >
          {budget ? 'Change budget' : 'Set a budget'}
        </button>
      </div>

      <p className="text-2xl font-semibold">{formatMoney(spent, baseCurrency)}</p>
      <p className="text-sm text-slate-500">
        spent this month
        {budget ? ` of ${formatMoney(progress.limit, baseCurrency)}` : ' · no budget set'}
      </p>

      {budget && (
        <>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full ${barColour}`}
              style={{ width: `${Math.min(progress.ratio, 1) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm">
            {progress.overspent ? (
              <span className="text-red-600">
                Over by {formatMoney(-progress.remaining, baseCurrency)}
              </span>
            ) : progress.nearingLimit ? (
              <span className="text-amber-600">
                {Math.round(progress.ratio * 100)}% used —{' '}
                {formatMoney(progress.remaining, baseCurrency)} left
              </span>
            ) : (
              <span className="text-slate-600">
                {formatMoney(progress.remaining, baseCurrency)} left
              </span>
            )}
          </p>
        </>
      )}

      {editing && (
        <form onSubmit={save} className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="decimal"
            placeholder={`Monthly limit in ${baseCurrency}`}
            required
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <button className="rounded-lg bg-ink px-4 text-white">Save</button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
