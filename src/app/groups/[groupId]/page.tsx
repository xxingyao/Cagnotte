'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/components/StoreProvider';
import { Modal } from '@/components/Modal';
import { CATEGORIES, CATEGORY_EMOJI, CURRENCIES } from '@/lib/options';
import { formatMoney, minorToAmountString, parseAmountToMinor } from '@/lib/money';
import { baseCurrencyAmount, computeBalances, computeSettlements, type Balance, type Settlement } from '@/lib/balances';
import type { Expense, Member } from '@/lib/types';

const SETTLEMENT_CATEGORY = 'Settlement';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onYes: () => void;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const router = useRouter();
  const {
    data, ready, userId, addExpense, editExpense, deleteExpense, deleteGroup, editGroupName,
    setBudget, syncGroup,
  } = useStore();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  const groupId = params.groupId;

  useEffect(() => {
    if (!ready || !groupId) return;
    let cancelled = false;
    syncGroup(groupId).catch((error: Error) => {
      if (!cancelled) setSyncError(error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, groupId, syncGroup]);

  useEffect(() => {
    if (!ready || !groupId) return;
    const refresh = () => {
      syncGroup(groupId).catch(() => {});
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
        <Link href="/" className="back-btn">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M13 16 7 10l6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All groups
        </Link>
      </main>
    );
  }

  const month = new Date().toISOString().slice(0, 7);

  const spent = groupExpenses
    .filter((e) => e.date.startsWith(month) && e.category !== SETTLEMENT_CATEGORY)
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
      {/* ── Toasts ── */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            <span className="toast-icon">{t.type === 'error' ? '🔴' : '🟢'}</span>
            {t.message}
          </div>
        ))}
      </div>

      <Link href="/" className="back-btn">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <path d="M13 16 7 10l6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All groups
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{group.name}</h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="Rename group"
          title="Rename group"
          onClick={() => setEditingGroupName(true)}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
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
          onSave={async (limitMinor) => {
            try {
              await setBudget(group.id, month, limitMinor);
              addToast(pick([
                'Budget set! Let\'s see how long that lasts. 😅',
                'Budget saved! Your future self thanks you. 🙏',
                'Limit locked in! The challenge begins. 💪',
                'Budget updated! Now try sticking to it. 😏',
              ]));
            } catch (error) {
              addToast((error as Error).message, 'error');
            }
          }}
        />

        <AddExpenseCard
          members={group.members}
          baseCurrency={group.baseCurrency}
          youId={userId}
          editing={editingExpense}
          onAdd={async (expense) => {
            try {
              await addExpense({ ...expense, groupId: group.id });
              await syncGroup(group.id);
              addToast(pick([
                'Expense logged! Your wallet felt that. 💸',
                'Added! Someone\'s paying for this… literally.',
                'Logged! Marie Kondo would be proud of this tracking.',
                'Expense added! Your budget is crying. 😢',
              ]));
            } catch (error) {
              addToast((error as Error).message, 'error');
            }
          }}
          onEdit={async (expenseId, expense) => {
            try {
              await editExpense(group.id, expenseId, expense);
              await syncGroup(group.id);
              setEditingExpenseId(null);
              addToast(pick([
                'Updated! The numbers have been corrected. ✏️',
                'Saved! History has been rewritten. Legally.',
                'Changes saved! Accountants love you. 📋',
                'Expense updated! The records have been amended.',
              ]));
            } catch (error) {
              addToast((error as Error).message, 'error');
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

        <SettleUpCard
          settlements={settlements}
          currency={group.baseCurrency}
          settlingKey={settlingKey}
          onSettle={async (settlement, key) => {
            setSettlingKey(key);
            try {
              await addExpense({
                groupId: group.id,
                description: `Settlement: ${settlement.fromName} → ${settlement.toName}`,
                amountMinor: settlement.amountMinor,
                currency: group.baseCurrency,
                category: SETTLEMENT_CATEGORY,
                payerId: settlement.fromId,
                date: new Date().toISOString().slice(0, 10),
                splitBetween: [settlement.toId],
              });
              await syncGroup(group.id);
              addToast(pick([
                'Settlement recorded! One less debt in the world. 🤝',
                'Marked as paid! Friendship preserved. 💪',
                'Settled! The financial gods are pleased. ⚖️',
                'Debt cleared! High five through the screen. 🖐️',
              ]));
            } catch (error) {
              addToast((error as Error).message, 'error');
            } finally {
              setSettlingKey(null);
            }
          }}
        />

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Expenses</h2>
            <button
              type="button"
              className="card-action"
              onClick={() =>
                syncGroup(group.id).catch((error: Error) => setSyncError(error.message))
              }
            >
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
                <path d="M17 10A7 7 0 1 1 3 10a7 7 0 0 1 14 0z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M17 3v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
                const isSettlement = expense.category === SETTLEMENT_CATEGORY;
                const recipient = group.members.find((m) => m.id === expense.splitBetween[0]);
                const recipientLabel =
                  expense.splitBetween[0] === userId ? 'you' : recipient?.name ?? 'someone';
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
                          {isSettlement
                            ? `${payerLabel} paid ${recipientLabel}`
                            : `${payerLabel} paid · split ${expense.splitBetween.length} way${
                                expense.splitBetween.length === 1 ? '' : 's'
                              }`}
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
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          aria-label={`Edit ${expense.description}`}
                          title="Edit"
                          onClick={() => setEditingExpenseId(expense.id)}
                        >
                          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                            <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          aria-label={`Delete ${expense.description}`}
                          title="Delete"
                          onClick={() => {
                            setConfirm({
                              title: 'Delete expense',
                              message: pick([
                                `"${expense.description}" is about to be wiped from existence. No undo button here.`,
                                `Poof — "${expense.description}" will vanish. Like your last paycheck on a Friday night.`,
                                `"${expense.description}" wants to live! Too bad you're heartless.`,
                                `Deleting "${expense.description}" won't bring your money back, you know.`,
                              ]),
                              confirmLabel: 'Delete it',
                              onYes: async () => {
                                setConfirm(null);
                                try {
                                  await deleteExpense(group.id, expense.id);
                                  addToast(pick([
                                    'Deleted! The evidence has been destroyed. 🔥',
                                    'Expense erased! What expense? 👀',
                                    'Gone. Poof. Like it never happened.',
                                  ]), 'error');
                                } catch (error) {
                                  addToast((error as Error).message, 'error');
                                }
                              },
                            });
                          }}
                        >
                          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
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
            className="btn-delete-group"
            onClick={() => {
              setConfirm({
                title: 'Delete group',
                message: pick([
                  `"${group.name}" and ALL its expenses will be vaporized. Everyone loses everything. Like Thanos, but for budgets. 💀`,
                  `Nuclear option activated. "${group.name}" goes boom for EVERYONE. Are you absolutely sure?`,
                  `You're about to delete "${group.name}" for ALL members. There's no "oops" button after this.`,
                  `This will nuke "${group.name}" from orbit. It's the only way to be sure… right? ☢️`,
                ]),
                confirmLabel: 'Delete group',
                onYes: async () => {
                  setConfirm(null);
                  try {
                    await deleteGroup(group.id);
                    addToast('Group obliterated! Everything\'s gone. 💀', 'error');
                    router.push('/');
                  } catch (error) {
                    addToast((error as Error).message, 'error');
                  }
                },
              });
            }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
              <path d="M3 6h14M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M5 6v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete this group
          </button>
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{confirm.title}</h2>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setConfirm(null)} aria-label="Close">
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="modal-message">{confirm.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Nah, keep it</button>
              <button type="button" className="btn btn-danger" onClick={confirm.onYes}>{confirm.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      <EditGroupNameModal
        open={editingGroupName}
        currentName={group.name}
        onSave={async (name) => {
          try {
            await editGroupName(group.id, name);
            setEditingGroupName(false);
            addToast(pick([
              'Renamed! Fresh identity, same debts. 😄',
              'Group renamed! Witness protection program complete. 🕵️',
              'New name, who dis? 🏷️',
              'Renamed! The group has been rebranded.',
            ]));
          } catch (error) {
            addToast((error as Error).message, 'error');
            setEditingGroupName(false);
          }
        }}
        onClose={() => setEditingGroupName(false)}
      />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Child components below are UNCHANGED from the original
   ──────────────────────────────────────────────────────────────────────────── */

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
            const isSettled = balance.netMinor === 0;
            const tone = balance.netMinor > 0 ? 'pos' : balance.netMinor < 0 ? 'neg' : '';
            const standing =
              balance.netMinor > 0
                ? `${isYou ? "you're" : 'is'} owed ${formatMoney(balance.netMinor, currency)}`
                : balance.netMinor < 0
                  ? `${isYou ? 'you owe' : 'owes'} ${formatMoney(-balance.netMinor, currency)}`
                  : '';
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
                  {isSettled ? (
                    <span className="chip chip-settled">
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true" style={{ marginRight: 4 }}>
                        <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Settled
                    </span>
                  ) : (
                    <span className={`amount ${tone}`}>{standing}</span>
                  )}
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
  settlements, currency, settlingKey, onSettle,
}: {
  settlements: Settlement[];
  currency: string;
  settlingKey: string | null;
  onSettle: (settlement: Settlement, key: string) => void;
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

      {settlements.map((settlement, i) => {
        const key = `${settlement.fromId}-${settlement.toId}-${i}`;
        const isSettling = settlingKey === key;
        return (
          <div key={key} className="settle">
            <strong>{settlement.fromName}</strong>
            <span className="settle-arrow">pays</span>
            <strong>{settlement.toName}</strong>
            <span className="row-end amount" style={{ marginLeft: 'auto' }}>
              {formatMoney(settlement.amountMinor, currency)}
            </span>
            <button
              type="button"
              className="card-action"
              disabled={settlingKey !== null}
              onClick={() => onSettle(settlement, key)}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
                <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isSettling ? 'Recording…' : 'Mark as paid'}
            </button>
          </div>
        );
      })}

      <p className="split-hint" style={{ marginTop: 12, marginBottom: 0 }}>
        Settle outside the app, then record it here — balances update once it&apos;s logged.
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
        <button type="button" className="card-action" onClick={() => setEditing((v) => !v)}>
          <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
            {limitMinor === null ? (
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          {limitMinor === null ? 'Set budget' : 'Edit budget'}
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

function EditGroupNameModal({
  open, currentName, onSave, onClose,
}: {
  open: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(currentName);
      setError(null);
    }
  }, [open, currentName]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) {
      setError("Group name can't be empty.");
      return;
    }
    onSave(draft.trim());
  }

  return (
    <Modal open={open} onClose={onClose} title="Rename group">
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">Group name</span>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <p className="split-hint" style={{ color: 'var(--negative)' }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn">
            Save
          </button>
        </div>
      </form>
    </Modal>
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
          <button type="button" className="card-action" onClick={onCancelEdit}>
            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Cancel
          </button>
        )}
      </div>

      <label className="field">
        <span className="field-label">What was it for?</span>
        <input className="input" value={description} required
               onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div className="grid-2">
        <label className="field">
          <span className="field-label">Amount</span>
          <input className="input" value={amount} inputMode="decimal" required
                 onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
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
                {m.id === youId ? 'You' : m.name}
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
        <div className="split-picker">
          {members.map((m) => {
            const selected = splitBetween.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`split-pill${selected ? ' is-selected' : ''}`}
                onClick={() => toggleSharer(m.id)}
                aria-pressed={selected}
              >
                <span className="split-pill-dot" aria-hidden="true" />
                {m.id === youId ? 'You' : m.name}
              </button>
            );
          })}
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