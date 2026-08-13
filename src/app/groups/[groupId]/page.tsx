'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/components/StoreProvider';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CATEGORIES, CATEGORY_EMOJI, CURRENCIES } from '@/lib/options';
import { formatMoney, minorToAmountString, parseAmountToMinor } from '@/lib/money';
import { baseCurrencyAmount, computeBalances, computeSettlements, type Balance, type Settlement } from '@/lib/balances';
import type { Expense, Member } from '@/lib/types';

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const router = useRouter();
  const {
    data, ready, userId, addExpense, editExpense, deleteExpense, deleteGroup, setBudget, syncGroup,
  } = useStore();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const groupId = params.groupId;

  // Every hook has to run before any early return, so these sit above the
  // `!ready` guard rather than next to the code that uses their results.
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

  // Someone else's spending won't appear on its own — there's no push channel.
  // Refetching on tab focus covers the realistic case: you switch away, your
  // friend logs dinner, you switch back.
  useEffect(() => {
    if (!ready || !groupId) return;
    const refresh = () => {
      syncGroup(groupId).catch(() => {
        // A failed background refresh shouldn't replace what's on screen with
        // an error — the mount-time sync already reports real problems.
      });
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [ready, groupId, syncGroup]);

  const group = data.groups.find((g) => g.id === groupId);

  const groupExpenses = useMemo(
    () =>
      data.expenses
        .filter((e) => e.groupId === groupId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.expenses, groupId],
  );

  const editingExpense = groupExpenses.find((e) => e.id === editingExpenseId) ?? null;
  const expenseToDelete = groupExpenses.find((e) => e.id === confirmDeleteExpenseId) ?? null;

  // Memoised because this walks every expense in the group, on every render.
  const balances = useMemo(
    () => (group ? computeBalances(groupExpenses, group.members, group.baseCurrency) : []),
    [groupExpenses, group],
  );

  const settlements = useMemo(() => computeSettlements(balances), [balances]);

  if (!ready) return <p className="sub">Loading…</p>;

  if (!group) {
    return (
      <main>
        <p className="empty">That group doesn&apos;t exist on this device.</p>
        <Link href="/" className="backlink">← All groups</Link>
      </main>
    );
  }

  const month = new Date().toISOString().slice(0, 7);

  // Anything that couldn't be converted (a rate lookup that failed, or an old
  // expense from before this feature) is silently excluded here — the
  // excludedCount banner below is what surfaces that to the user.
  const spent = groupExpenses
    .filter((e) => e.date.startsWith(month))
    .reduce((sum, e) => sum + (baseCurrencyAmount(e, group.baseCurrency) ?? 0), 0);

  const excludedCount = groupExpenses.filter(
    (e) => baseCurrencyAmount(e, group.baseCurrency) === null,
  ).length;

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
          onSave={(limitMinor) =>
            setBudget(group.id, month, limitMinor).catch((error: Error) =>
              setSyncError(error.message),
            )
          }
        />

        <AddExpenseCard
          members={group.members}
          baseCurrency={group.baseCurrency}
          youId={userId}
          editing={editingExpense}
          onAdd={async (expense) => {
            try {
              await addExpense({ ...expense, groupId: group.id });
              // Re-read from the server so the row on screen is the row that
              // was actually stored, not an optimistic guess.
              await syncGroup(group.id);
            } catch (error) {
              setSyncError((error as Error).message);
            }
          }}
          onEdit={async (expenseId, expense) => {
            try {
              await editExpense(group.id, expenseId, expense);
              await syncGroup(group.id);
              setEditingExpenseId(null);
            } catch (error) {
              setSyncError((error as Error).message);
            }
          }}
          onCancelEdit={() => setEditingExpenseId(null)}
        />

        <BalancesCard
          balances={balances}
          currency={group.baseCurrency}
          excludedCount={excludedCount}
          youId={userId}
        />

        <SettleUpCard settlements={settlements} currency={group.baseCurrency} />

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Expenses</h2>
            <button
              type="button"
              className="sub"
              style={{ background: 'none', border: 0, cursor: 'pointer' }}
              onClick={() =>
                syncGroup(group.id).catch((error: Error) => setSyncError(error.message))
              }
            >
              Refresh
            </button>
          </div>
          {groupExpenses.length === 0 ? (
            <p className="sub">Nothing logged yet.</p>
          ) : (
            <ul className="rows">
              {groupExpenses.map((expense) => {
                const showDate = expense.date !== lastDate;
                lastDate = expense.date;
                const payer = group.members.find((m) => m.id === expense.payerId);
                const payerLabel =
                  expense.payerId === userId ? 'You' : payer?.name ?? 'Someone';
                return (
                  <Fragment key={expense.id}>
                    {showDate && <li className="day-label">{expense.date}</li>}
                    <li className="row">
                      <span className="row-icon" aria-hidden="true">
                        {CATEGORY_EMOJI[expense.category] ?? '📦'}
                      </span>
                      <div className="row-main">
                        <div className="row-title">{expense.description}</div>
                        <div className="row-sub">
                          {payerLabel} paid · split {expense.splitBetween.length} way
                          {expense.splitBetween.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="row-end">
                        <div className="amount">
                          {formatMoney(expense.amountMinor, expense.currency)}
                        </div>
                        {expense.currency !== group.baseCurrency && expense.baseAmountMinor !== null && (
                          <div className="row-sub">
                            ≈ {formatMoney(expense.baseAmountMinor, group.baseCurrency)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Edit ${expense.description}`}
                        title="Edit"
                        onClick={() => setEditingExpenseId(expense.id)}
                        style={{
                          background: 'none', border: 0, cursor: 'pointer',
                          color: 'var(--ink-muted)', fontSize: 15, lineHeight: 1,
                          padding: '0 0 0 10px',
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${expense.description}`}
                        title="Delete"
                        onClick={() => setConfirmDeleteExpenseId(expense.id)}
                        style={{
                          background: 'none', border: 0, cursor: 'pointer',
                          color: 'var(--ink-muted)', fontSize: 18, lineHeight: 1,
                          padding: '0 0 0 6px',
                        }}
                      >
                        ×
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </section>

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            type="button"
            className="sub"
            onClick={() => setConfirmDeleteGroup(true)}
            style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--negative)' }}
          >
            Delete this group
          </button>
        </div>
      </div>

      <ConfirmModal
        open={expenseToDelete !== null}
        title="Delete expense"
        message={
          expenseToDelete
            ? `Delete "${expenseToDelete.description}"? This can't be undone.`
            : ''
        }
        onConfirm={() => {
          if (!expenseToDelete) return;
          deleteExpense(group.id, expenseToDelete.id).catch((error: Error) =>
            setSyncError(error.message),
          );
          setConfirmDeleteExpenseId(null);
        }}
        onCancel={() => setConfirmDeleteExpenseId(null)}
      />

      <ConfirmModal
        open={confirmDeleteGroup}
        title="Delete group"
        message={`Delete "${group.name}" for everyone? All expenses and budgets in it are gone permanently — this can't be undone.`}
        confirmLabel={deletingGroup ? 'Deleting…' : 'Delete group'}
        onConfirm={async () => {
          setDeletingGroup(true);
          try {
            await deleteGroup(group.id);
            router.push('/');
          } catch (error) {
            setSyncError((error as Error).message);
            setDeletingGroup(false);
            setConfirmDeleteGroup(false);
          }
        }}
        onCancel={() => setConfirmDeleteGroup(false)}
      />
    </main>
  );
}

function BalancesCard({
  balances, currency, excludedCount, youId,
}: {
  balances: Balance[];
  currency: string;
  excludedCount: number;
  youId: string;
}) {
  const anyActivity = balances.some((b) => b.paidMinor !== 0 || b.owedMinor !== 0);

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Balances</h2>
      </div>

      {!anyActivity ? (
        <p className="sub">Nothing to balance yet.</p>
      ) : (
        <ul className="rows">
          {balances.map((balance) => {
            const isYou = balance.memberId === youId;
            const tone = balance.netMinor > 0 ? 'pos' : balance.netMinor < 0 ? 'neg' : 'dim';
            const standing =
              balance.netMinor > 0
                ? `${isYou ? "you're" : 'is'} owed ${formatMoney(balance.netMinor, currency)}`
                : balance.netMinor < 0
                  ? `${isYou ? 'you owe' : 'owes'} ${formatMoney(-balance.netMinor, currency)}`
                  : 'settled up';
            return (
              <li key={balance.memberId} className="row">
                <div className="row-main">
                  <div className="row-title">
                    {isYou ? `${balance.name} (you)` : balance.name}
                  </div>
                  <div className="row-sub">
                    paid {formatMoney(balance.paidMinor, currency)}
                  </div>
                </div>
                <div className="row-end">
                  <span className={`amount ${tone}`}>{standing}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {excludedCount > 0 && (
        <p className="split-hint" style={{ marginBottom: 0 }}>
          {excludedCount} expense{excludedCount === 1 ? '' : 's'} couldn&apos;t be converted to{' '}
          {currency} and {excludedCount === 1 ? 'is' : 'are'} left out of the totals.
        </p>
      )}
    </section>
  );
}

function SettleUpCard({
  settlements, currency,
}: {
  settlements: Settlement[];
  currency: string;
}) {
  if (settlements.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Settle up</h2>
        <span className="sub">
          {settlements.length} payment{settlements.length === 1 ? '' : 's'} clears the group
        </span>
      </div>

      {settlements.map((settlement, i) => (
        <div key={`${settlement.fromId}-${settlement.toId}-${i}`} className="settle">
          <strong>{settlement.fromName}</strong>
          <span className="settle-arrow">pays</span>
          <strong>{settlement.toName}</strong>
          <span className="row-end amount" style={{ marginLeft: 'auto' }}>
            {formatMoney(settlement.amountMinor, currency)}
          </span>
        </div>
      ))}

      <p className="split-hint" style={{ marginTop: 12, marginBottom: 0 }}>
        Settle outside the app — Cagnotte only keeps the record.
      </p>
    </section>
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

interface ExpenseFields {
  description: string; amountMinor: number; currency: string;
  category: string; payerId: string; date: string; splitBetween: string[];
}

function AddExpenseCard({
  members, baseCurrency, youId, editing, onAdd, onEdit, onCancelEdit,
}: {
  members: Member[];
  baseCurrency: string;
  youId: string;
  editing: Expense | null;
  onAdd: (e: ExpenseFields) => void;
  onEdit: (expenseId: string, e: ExpenseFields) => void;
  onCancelEdit: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [category, setCategory] = useState('Food');
  const [payerId, setPayerId] = useState(
    members.some((m) => m.id === youId) ? youId : members[0]?.id ?? '',
  );
  const [date, setDate] = useState(today);
  const [splitBetween, setSplitBetween] = useState<string[]>(members.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);

  // One effect drives both "start/stop editing" and "a member joined mid-
  // session". Keyed on editing.id (not the object) since every sync hands
  // back a new Expense object even when nothing changed — using the object
  // itself would re-run this every render and wipe whatever you're typing.
  const memberKey = members.map((m) => m.id).join(',');
  useEffect(() => {
    if (editing) {
      setDescription(editing.description);
      setAmount(minorToAmountString(editing.amountMinor, editing.currency));
      setCurrency(editing.currency);
      setCategory(editing.category);
      setPayerId(editing.payerId);
      setDate(editing.date);
      setSplitBetween(editing.splitBetween);
    } else {
      setDescription('');
      setAmount('');
      setCurrency(baseCurrency);
      setCategory('Food');
      setPayerId(members.some((m) => m.id === youId) ? youId : members[0]?.id ?? '');
      setDate(today);
      setSplitBetween(members.map((m) => m.id));
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, memberKey, youId]);

  function toggleSharer(id: string) {
    setSplitBetween((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amountMinor = parseAmountToMinor(amount, currency);
    if (amountMinor === null) {
      setError('Enter an amount like 45 or 45.50');
      return;
    }
    if (splitBetween.length === 0) {
      setError('Pick at least one person to split this between.');
      return;
    }
    const fields = {
      description: description.trim(), amountMinor, currency,
      category, payerId, date, splitBetween,
    };
    if (editing) {
      onEdit(editing.id, fields);
    } else {
      onAdd(fields);
      setDescription('');
      setAmount('');
    }
    setError(null);
  }

  const amountMinor = parseAmountToMinor(amount, currency);
  const perPerson =
    amountMinor !== null && splitBetween.length > 0
      ? Math.floor(amountMinor / splitBetween.length)
      : null;

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head">
        <h2 className="card-title">{editing ? 'Edit expense' : 'Add an expense'}</h2>
        {editing && (
          <button
            type="button"
            className="sub"
            onClick={onCancelEdit}
            style={{ background: 'none', border: 0, cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
      </div>

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
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === youId ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Date</span>
        <input className="input" type="date" value={date} required
               onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">Split between</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
          {members.map((m) => (
            <label key={m.id} className="checkbox-row">
              <input type="checkbox" checked={splitBetween.includes(m.id)}
                     onChange={() => toggleSharer(m.id)} />
              {m.id === youId ? `${m.name} (you)` : m.name}
            </label>
          ))}
        </div>
      </div>

      {perPerson !== null && splitBetween.length > 1 && (
        <p className="split-hint">
          About {formatMoney(perPerson, currency)} each, {splitBetween.length} ways.
        </p>
      )}

      {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
      <button type="submit" className="btn">{editing ? 'Save changes' : 'Add expense'}</button>
    </form>
  );
}