'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStore } from '@/components/StoreProvider';
import { CATEGORIES, CATEGORY_EMOJI, CURRENCIES } from '@/lib/options';
import { formatMoney, parseAmountToMinor } from '@/lib/money';

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const { data, ready, addExpense, setBudget, syncGroup } = useStore();
  const [syncError, setSyncError] = useState<string | null>(null);

  const groupId = params.groupId;

  // Every hook has to run before any early return, so this sits above the
  // `!ready` guard rather than next to the code that uses its result.
  useEffect(() => {
    if (!ready || !groupId) return;
    let cancelled = false;
    syncGroup(groupId).catch((error: Error) => {
      // Cached expenses stay on screen; the banner says they may be stale.
      if (!cancelled) setSyncError(error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, groupId, syncGroup]);

  if (!ready) return <p className="sub">Loading…</p>;

  const group = data.groups.find((g) => g.id === groupId);
  if (!group) {
    return (
      <main>
        <p className="empty">That group doesn&apos;t exist on this device.</p>
        <Link href="/" className="backlink">← All groups</Link>
      </main>
    );
  }

  const month = new Date().toISOString().slice(0, 7);
  const groupExpenses = data.expenses
    .filter((e) => e.groupId === group.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Only same-currency expenses count toward the budget for now; converting
  // the others needs exchange rates, which is a later step.
  const spent = groupExpenses
    .filter((e) => e.date.startsWith(month) && e.currency === group.baseCurrency)
    .reduce((sum, e) => sum + e.amountMinor, 0);

  const budget = data.budgets.find((b) => b.groupId === group.id && b.month === month);
  const percent = budget && budget.limitMinor > 0
    ? Math.round((spent / budget.limitMinor) * 100)
    : 0;

  let lastDate = '';

  return (
    <main>
      <Link href="/" className="backlink">← All groups</Link>
      <h1 className="page-title">{group.name}</h1>
      <p className="page-sub">
        {group.members.length} members · shown in {group.baseCurrency} ·{' '}
        <span className="chip chip-code">{group.inviteCode}</span>
      </p>

      <div className="stack">
        {syncError && (
          <p className="split-hint" style={{ color: 'var(--negative)' }}>
            Couldn&apos;t reach the server: {syncError}
          </p>
        )}

        <BudgetCard
          spent={spent}
          limitMinor={budget?.limitMinor ?? null}
          percent={percent}
          currency={group.baseCurrency}
          onSave={(limitMinor) => setBudget(group.id, month, limitMinor)}
        />

        <AddExpenseCard
          group={group}
          onAdd={(expense) =>
            addExpense({ ...expense, groupId: group.id }).catch((error: Error) =>
              setSyncError(error.message),
            )
          }
        />

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Expenses</h2>
          </div>
          {groupExpenses.length === 0 ? (
            <p className="sub">Nothing logged yet.</p>
          ) : (
            <ul className="rows">
              {groupExpenses.map((expense) => {
                const showDate = expense.date !== lastDate;
                lastDate = expense.date;
                const payer = group.members.find((m) => m.id === expense.payerId);
                return (
                  <Fragment key={expense.id}>
                    {showDate && <li className="day-label">{expense.date}</li>}
                    <li className="row">
                      <span className="row-icon" aria-hidden="true">
                        {CATEGORY_EMOJI[expense.category] ?? '📦'}
                      </span>
                      <div className="row-main">
                        <div className="row-title">{expense.description}</div>
                        <div className="row-sub">{payer?.name ?? 'Someone'} paid</div>
                      </div>
                      <div className="row-end">
                        <div className="amount">
                          {formatMoney(expense.amountMinor, expense.currency)}
                        </div>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function BudgetCard({
  spent, limitMinor, percent, currency, onSave,
}: {
  spent: number;
  limitMinor: number | null;
  percent: number;
  currency: string;
  onSave: (limitMinor: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const minor = parseAmountToMinor(draft, currency);
    if (minor === null) {
      setError('Enter an amount like 1200 or 1200.00');
      return;
    }
    onSave(minor);
    setEditing(false);
    setDraft('');
    setError(null);
  }

  const meterClass = percent > 100 ? 'is-over' : percent >= 85 ? 'is-warn' : '';

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">This month</h2>
        <button type="button" className="sub" onClick={() => setEditing((v) => !v)}
                style={{ background: 'none', border: 0, cursor: 'pointer' }}>
          {limitMinor === null ? 'Set a budget' : 'Change budget'}
        </button>
      </div>

      <div className="amount-lg">{formatMoney(spent, currency)}</div>
      <div className="sub">
        spent{limitMinor !== null && ` of ${formatMoney(limitMinor, currency)}`}
      </div>

      {limitMinor !== null && (
        <>
          <div className="meter">
            <div className={`meter-fill ${meterClass}`}
                 style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
          <div className="budget-foot">
            <span>{formatMoney(limitMinor - spent, currency)} left</span>
            <span className="dim">{percent}%</span>
          </div>
        </>
      )}

      {editing && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input className="input" value={draft} inputMode="decimal"
                 onChange={(e) => setDraft(e.target.value)}
                 placeholder={`Limit in ${currency}`} required />
          <button type="submit" className="btn" style={{ width: 'auto' }}>Save</button>
        </form>
      )}
      {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
    </section>
  );
}

function AddExpenseCard({
  group, onAdd,
}: {
  group: { baseCurrency: string; members: { id: string; name: string }[] };
  onAdd: (e: {
    description: string; amountMinor: number; currency: string;
    category: string; payerId: string; date: string;
  }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(group.baseCurrency);
  const [category, setCategory] = useState('Food');
  const [payerId, setPayerId] = useState(group.members[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amountMinor = parseAmountToMinor(amount, currency);
    if (amountMinor === null) {
      setError('Enter an amount like 45 or 45.50');
      return;
    }
    onAdd({ description: description.trim(), amountMinor, currency, category, payerId, date });
    setDescription('');
    setAmount('');
    setError(null);
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head"><h2 className="card-title">Add an expense</h2></div>

      <label className="field">
        <span className="field-label">What was it for?</span>
        <input className="input" value={description} required
               onChange={(e) => setDescription(e.target.value)}
               placeholder="Dinner at the market" />
      </label>

      <div className="grid-2">
        <label className="field">
          <span className="field-label">Amount</span>
          <input className="input" value={amount} inputMode="decimal" required
                 onChange={(e) => setAmount(e.target.value)} placeholder="45.00" />
        </label>
        <label className="field">
          <span className="field-label">Currency</span>
          <select className="select" value={currency}
                  onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select className="select" value={category}
                  onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Paid by</span>
          <select className="select" value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}>
            {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Date</span>
        <input className="input" type="date" value={date} required
               onChange={(e) => setDate(e.target.value)} />
      </label>

      {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
      <button type="submit" className="btn">Add expense</button>
    </form>
  );
}