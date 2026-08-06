'use client';

import { useState } from 'react';
import { getClient } from '@/lib/amplify';
import { parseAmount, formatMoney } from '@/lib/money';
import { convert, type RateTable } from '@/lib/fx';
import { splitEqual } from '@/lib/splits';
import { CURRENCIES, CATEGORIES, categoryLabel } from '@/lib/currencies';
import type { Me } from '@/hooks/useMe';
import type { Schema } from '../../amplify/data/resource';

type Group = Schema['Group']['type'];
type Membership = Schema['Membership']['type'];
type Category = Schema['Expense']['type']['category'];

export function ExpenseForm({
  group,
  members,
  me,
  rates,
}: {
  group: Group;
  members: Membership[];
  me: Me;
  rates: RateTable;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(group.baseCurrency);
  const [category, setCategory] = useState<Category>('FOOD');
  const [date, setDate] = useState(today);
  const [payerId, setPayerId] = useState(me.sub);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview of the conversion, so nobody is surprised by the rate after
  // the fact.
  let preview: string | null = null;
  if (amount && currency !== group.baseCurrency) {
    try {
      const minor = parseAmount(amount, currency);
      const { amountInBase } = convert(minor, currency, group.baseCurrency, rates);
      preview = `≈ ${formatMoney(amountInBase, group.baseCurrency)}`;
    } catch {
      preview = null;
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (members.length === 0) {
      setError('This group has no members to split between yet.');
      return;
    }

    setBusy(true);
    try {
      const amountOriginal = parseAmount(amount, currency);
      const { amountInBase, fxRateUsed } = convert(
        amountOriginal,
        currency,
        group.baseCurrency,
        rates
      );

      const client = getClient();
      const { data: expense, errors } = await client.models.Expense.create({
        groupId: group.id,
        groupKey: group.groupKey,
        payerId,
        description: description.trim(),
        category,
        amountOriginal,
        currencyOriginal: currency,
        amountInBase,
        fxRateUsed,
        date,
      });
      if (errors?.length || !expense) throw new Error(errors?.[0]?.message ?? 'Save failed.');

      // MVP splits everything equally across the group. The share rows are
      // written client-side; moving this into a Lambda would make the expense
      // and its splits a single atomic write (see the roadmap).
      const shares = splitEqual(
        amountInBase,
        members.map((m) => m.userId)
      );
      await Promise.all(
        shares.map((share) =>
          client.models.Split.create({
            expenseId: expense.id,
            groupId: group.id,
            groupKey: group.groupKey,
            userId: share.userId,
            shareAmount: share.shareAmount,
          })
        )
      );

      setDescription('');
      setAmount('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that expense.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium">Add an expense</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm text-slate-600">
          What was it for?
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner at the market"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-ink"
          />
        </label>

        <label className="text-sm text-slate-600">
          Amount
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="45.00"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-ink"
          />
          {preview && <span className="mt-1 block text-xs text-slate-500">{preview}</span>}
        </label>

        <label className="text-sm text-slate-600">
          Currency
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-ink"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Category
          <select
            value={category ?? 'OTHER'}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-ink"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-ink"
          />
        </label>

        <label className="sm:col-span-2 text-sm text-slate-600">
          Paid by
          <select
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-ink"
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
                {member.userId === me.sub ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Split equally between all {members.length} members.
      </p>

      <button
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-ink py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Add expense'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
