'use client';

import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { decimalsFor, formatMoney, parseAmountToMinor } from '@/lib/money';
import { getDefaultCurrency } from '@/lib/prefs';
import { CATEGORIES, CATEGORY_EMOJI } from '@/lib/options';
import { normaliseMerchant, resolveCategory } from '@/lib/categorise';

interface Toast { id: number; message: string; type: 'success' | 'error'; }

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BudgetPage() {
  const [month, setMonth] = useState(monthKey());
  const [expenses, setExpenses] = useState<api.PersonalExpense[]>([]);
  const [budgets, setBudgets] = useState<api.PersonalBudget[]>([]);
  const [inbox, setInbox] = useState<api.InboxItem[]>([]);
  const [rules, setRules] = useState<api.MerchantRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [inboxCategory, setInboxCategory] = useState<Record<string, string>>({});
  const [busySk, setBusySk] = useState<string | null>(null);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');

  // Edit an existing transaction
  const [editTarget, setEditTarget] = useState<api.PersonalExpense | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('Other');
  const [editDirection, setEditDirection] = useState<'in' | 'out'>('out');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const currency = getDefaultCurrency();

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  /* ── Load ── */

  useEffect(() => {
    const paint = Promise.all([
      api.listPersonal(month).then(setExpenses),
      api.listPersonalBudgets().then(setBudgets),
      api.listRules().then(setRules),
      api.listInbox().then(setInbox),
    ]);

    paint
      .catch((e) => addToast((e as Error).message, 'error'))
      .finally(() => setLoading(false));

    // Silent revalidation — a failed refresh leaves the cached view in place.
    void api.listPersonal(month, { fresh: true }).then(setExpenses).catch(() => {});
    void api.listPersonalBudgets({ fresh: true }).then(setBudgets).catch(() => {});
    void api.listRules({ fresh: true }).then(setRules).catch(() => {});
    void api.listInbox({ fresh: true }).then(setInbox).catch(() => {});
  }, []);

  useEffect(() => {
    api.listPersonal(month)
      .then(setExpenses)
      .catch((e) => addToast((e as Error).message, 'error'));
    void api.listPersonal(month, { fresh: true }).then(setExpenses).catch(() => {});
  }, [month]);

  // Re-guess whenever either the inbox or the learned rules change, so a rule
  // saved on one item immediately improves the guess on the next.
  useEffect(() => {
    const guesses: Record<string, string> = {};
    inbox.forEach((i) => { guesses[i.sk] = resolveCategory(i.merchant, rules); });
    setInboxCategory(guesses);
  }, [inbox, rules]);

  /* ── Derived ── */

  const budget = useMemo(() => {
    const applicable = budgets
      .filter((b) => b.month <= month)
      .sort((a, b) => b.month.localeCompare(a.month));
    return applicable[0] ?? null;
  }, [budgets, month]);

  const spent = useMemo(
    () => expenses.filter((e) => e.direction !== 'in').reduce((sum, e) => sum + e.amountMinor, 0),
    [expenses],
  );

  const received = useMemo(
    () => expenses.filter((e) => e.direction === 'in').reduce((sum, e) => sum + e.amountMinor, 0),
    [expenses],
  );

  const limit = budget?.limitMinor ?? 0;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const over = limit > 0 && spent > limit;

  /* ── Review inbox ── */

  async function fileItem(item: api.InboxItem) {
    const category = inboxCategory[item.sk] || 'Other';
    setBusySk(item.sk);
    setInbox((prev) => prev.filter((i) => i.sk !== item.sk));

    try {
      const created = await api.addPersonal({
        // The inbox stores major units; everything downstream is minor.
        amountMinor: Math.round(item.amount * 10 ** decimalsFor(item.currency)),
        currency: item.currency,
        merchant: item.merchant,
        category,
        direction: item.direction === 'in' ? 'in' : 'out',
        source: item.source,
        note: item.note,
      });

      if (created.date.startsWith(month)) {
        setExpenses((prev) => [...prev, created]);
      }

      // Remember this merchant so it's pre-filled next time. Fire-and-forget —
      // the transaction is already saved and this only affects future guesses.
      const norm = normaliseMerchant(item.merchant);
      if (norm) {
        void api.saveRule(norm, category)
          .then(() => setRules((prev) => {
            const without = prev.filter((r) => r.merchant !== norm);
            return [...without, { sk: `rule#${norm}`, merchant: norm, category }];
          }))
          .catch(() => {});
      }

      void api.dismissInboxItem(item.sk).catch(() => {});
      addToast('Added. 📥');
    } catch (e) {
      setInbox((prev) => [item, ...prev]);
      addToast((e as Error).message, 'error');
    } finally {
      setBusySk(null);
    }
  }

  async function dismissItem(sk: string) {
    setBusySk(sk);
    setInbox((prev) => prev.filter((i) => i.sk !== sk));
    try {
      await api.dismissInboxItem(sk);
      addToast('Dismissed.');
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setBusySk(null);
    }
  }

  /* ── Budget ── */

  async function saveBudget() {
    const minor = parseAmountToMinor(budgetDraft || '', currency);
    if (minor === null) { addToast('Enter a plain number, e.g. 1500', 'error'); return; }
    try {
      await api.setPersonalBudget(month, minor, currency);
      setBudgets(await api.listPersonalBudgets({ fresh: true }));
      setEditingBudget(false);
      addToast('Budget set. 🎯');
    } catch (e) {
      addToast((e as Error).message, 'error');
    }
  }

  /* ── Transactions ── */

  function openEdit(e: api.PersonalExpense) {
    setEditTarget(e);
    setEditMerchant(e.merchant);
    setEditAmount((e.amountMinor / 10 ** decimalsFor(e.currency)).toString());
    setEditCategory(e.category);
    setEditDirection(e.direction === 'in' ? 'in' : 'out');
    setEditNote(e.note || '');
  }

  async function saveEdit() {
    if (!editTarget) return;
    const minor = parseAmountToMinor(editAmount || '', editTarget.currency);
    if (minor === null) { addToast('Enter a plain number, e.g. 12.50', 'error'); return; }

    setSavingEdit(true);
    const patch = {
      merchant: editMerchant.trim() || editTarget.merchant,
      amountMinor: minor,
      category: editCategory,
      direction: editDirection,
      note: editNote,
    };

    try {
      await api.editPersonal(editTarget.sk, patch);
      setExpenses((prev) => prev.map((e) => (e.sk === editTarget.sk ? { ...e, ...patch } : e)));

      // A correction is the strongest signal there is — learn from it.
      const norm = normaliseMerchant(patch.merchant);
      if (norm) {
        void api.saveRule(norm, editCategory)
          .then(() => setRules((prev) => {
            const without = prev.filter((r) => r.merchant !== norm);
            return [...without, { sk: `rule#${norm}`, merchant: norm, category: editCategory }];
          }))
          .catch(() => {});
      }

      setEditTarget(null);
      addToast('Updated.');
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeExpense(sk: string) {
    const previous = expenses;
    setExpenses((prev) => prev.filter((e) => e.sk !== sk));
    try {
      await api.deletePersonal(sk);
      addToast('Removed.');
    } catch (e) {
      setExpenses(previous);
      addToast((e as Error).message, 'error');
    }
  }

  return (
    <main>
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            <span className="toast-icon">{t.type === 'error' ? '🔴' : '🟢'}</span>
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Header with the review bell ── */}
      <div className="page-head-row">
        <h1 className="page-title" style={{ margin: 0 }}>Budget</h1>
        <button
          type="button"
          className={`bell-btn${inbox.length > 0 ? ' has-items' : ''}`}
          onClick={() => setReviewOpen(true)}
          title={inbox.length > 0 ? `${inbox.length} to review` : 'Nothing to review'}
        >
          <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
            <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 0 0 10 3Z"
              stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8.5 15a1.75 1.75 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {inbox.length > 0 && <span className="bell-badge">{inbox.length}</span>}
        </button>
      </div>

      {/* ── Month switcher ── */}
      <div className="month-nav">
        <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span className="month-label">{monthLabel(month)}</span>
        <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= monthKey()}>›</button>
      </div>

      {/* ── Budget ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Budget</h2>
          {!editingBudget && (
            <button type="button" className="card-action"
              onClick={() => { setBudgetDraft(limit ? String(limit / 10 ** decimalsFor(currency)) : ''); setEditingBudget(true); }}>
              {limit ? 'Change' : 'Set a budget'}
            </button>
          )}
        </div>

        {editingBudget ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={budgetDraft} inputMode="decimal"
              onChange={(e) => setBudgetDraft(e.target.value)} placeholder="1500" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(); }} />
            <button type="button" className="btn" style={{ width: 'auto' }} onClick={saveBudget}>Save</button>
            <button type="button" className="btn btn-ghost" style={{ width: 'auto' }}
              onClick={() => setEditingBudget(false)}>Cancel</button>
          </div>
        ) : limit > 0 ? (
          <>
            <div className="budget-row">
              <span className="amount-lg">{formatMoney(spent, currency)}</span>
              <span className="sub">of {formatMoney(limit, currency)}</span>
            </div>
            <div className="meter">
              <div className={`meter-fill${over ? ' is-over' : pct > 80 ? ' is-warn' : ''}`}
                style={{ width: `${pct}%` }} />
            </div>
            <div className="budget-foot">
              <span>{Math.round(pct)}% used</span>
              <span className={over ? 'neg' : ''}>
                {over
                  ? `${formatMoney(spent - limit, currency)} over`
                  : `${formatMoney(limit - spent, currency)} left`}
              </span>
            </div>
          </>
        ) : (
          <p className="sub">No budget set for {monthLabel(month)}. Set one and it carries forward automatically.</p>
        )}

        {received > 0 && (
          <p className="split-hint" style={{ marginTop: 12, marginBottom: 0 }}>
            {formatMoney(received, currency)} received this month — not counted against the budget.
          </p>
        )}
      </div>

      {/* ── Transactions ── */}
      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Transactions</h2>
          <span className="sub">{expenses.length}</span>
        </div>
        {loading ? (
          <div className="tracking-empty"><p className="sub">Loading…</p></div>
        ) : expenses.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">🧾</div>
            <p>Nothing here yet.</p>
            <p className="sub">Forwarded bank alerts appear in the bell above for review.</p>
          </div>
        ) : (
          <ul className="rows">
            {[...expenses].sort((a, b) => b.sk.localeCompare(a.sk)).map((e) => (
              <li key={e.sk} className="row">
                <div className="row-icon">{CATEGORY_EMOJI[e.category] ?? '📦'}</div>
                <div className="row-main">
                  <div className="row-title">{e.merchant}</div>
                  <div className="row-sub">{e.date} · {e.category} · {e.source}</div>
                </div>
                <div className="row-end">
                  <span className={`amount ${e.direction === 'in' ? 'pos' : ''}`}>
                    {e.direction === 'in' ? '+' : ''}{formatMoney(e.amountMinor, e.currency)}
                  </span>
                </div>
                <div className="row-actions">
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => openEdit(e)} title="Edit">
                    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                      <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm is-danger"
                    onClick={() => removeExpense(e.sk)} title="Delete">
                    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Review panel ── */}
      {reviewOpen && (
        <div className="modal-backdrop" onClick={() => setReviewOpen(false)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">To review</h2>
              <button type="button" className="modal-close" onClick={() => setReviewOpen(false)} aria-label="Close">×</button>
            </div>

            {inbox.length === 0 ? (
              <div className="tracking-empty">
                <div className="tracking-empty-icon">✅</div>
                <p>All caught up.</p>
                <p className="sub">Forwarded bank alerts land here.</p>
              </div>
            ) : (
              <ul className="inbox-list">
                {inbox.map((item) => {
                  const isIn = item.direction === 'in';
                  return (
                    <li key={item.sk} className="inbox-row">
                      <div className="inbox-main">
                        <div className="inbox-merchant">
                          {item.merchant}
                          {isIn && <span className="chip" style={{ marginLeft: 8 }}>received</span>}
                        </div>
                        <div className="inbox-meta">
                          {item.source}{item.note && ` · ${item.note}`}
                        </div>
                      </div>
                      <div className={`inbox-amount ${isIn ? 'pos' : ''}`}>
                        {isIn ? '+' : ''}{item.currency} {item.amount.toFixed(2)}
                      </div>
                      <select
                        className="select inbox-cat"
                        value={inboxCategory[item.sk] || 'Other'}
                        onChange={(e) => setInboxCategory((p) => ({ ...p, [item.sk]: e.target.value }))}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>
                        ))}
                      </select>
                      <div className="inbox-actions">
                        <button type="button" className="btn" style={{ width: 'auto' }}
                          onClick={() => fileItem(item)} disabled={busySk === item.sk}>
                          {busySk === item.sk ? '…' : 'Add'}
                        </button>
                        <button type="button" className="icon-btn icon-btn-sm is-danger"
                          onClick={() => dismissItem(item.sk)} disabled={busySk === item.sk} title="Dismiss">
                          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="split-hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Categories you pick are remembered for that merchant.
            </p>
          </div>
        </div>
      )}

      {/* ── Edit transaction ── */}
      {editTarget && (
        <div className="modal-backdrop" onClick={() => setEditTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Edit transaction</h2>
              <button type="button" className="modal-close" onClick={() => setEditTarget(null)} aria-label="Close">×</button>
            </div>

            <label className="field">
              <span className="field-label">Merchant</span>
              <input className="input" value={editMerchant}
                onChange={(e) => setEditMerchant(e.target.value)} autoFocus />
            </label>

            <div className="grid-2">
              <label className="field">
                <span className="field-label">Amount ({editTarget.currency})</span>
                <input className="input" value={editAmount} inputMode="decimal"
                  onChange={(e) => setEditAmount(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Category</span>
                <select className="select" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field">
              <span className="field-label">Direction</span>
              <div className="theme-toggle">
                <button type="button" className={`theme-toggle-btn${editDirection === 'out' ? ' is-active' : ''}`}
                  onClick={() => setEditDirection('out')}>Spent</button>
                <button type="button" className={`theme-toggle-btn${editDirection === 'in' ? ' is-active' : ''}`}
                  onClick={() => setEditDirection('in')}>Received</button>
              </div>
            </div>

            <label className="field">
              <span className="field-label">Note</span>
              <input className="input" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            </label>

            <p className="split-hint">
              Dated {editTarget.date} — the date can&apos;t be changed here. Delete and re-add if it&apos;s wrong.
            </p>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
              <button type="button" className="btn" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}