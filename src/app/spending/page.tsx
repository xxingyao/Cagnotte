'use client';

import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { decimalsFor, formatMoney, parseAmountToMinor } from '@/lib/money';
import { getDefaultCurrency } from '@/lib/prefs';
import { CATEGORIES, CATEGORY_EMOJI } from '@/lib/options';

interface Toast { id: number; message: string; type: 'success' | 'error'; }

/**
 * Merchant-name hints for a first-guess category. Deliberately crude — it
 * only pre-selects a dropdown the user can change, so a wrong guess costs one
 * tap and a right one saves the whole interaction.
 */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/bread|bakery|cafe|coffee|kopi|restaurant|food|kitchen|eat|mcdonald|starbucks|subway/i, 'Food'],
  [/ntuc|fairprice|giant|cold storage|sheng siong|grocer|market/i, 'Groceries'],
  [/grab|gojek|comfort|taxi|smrt|sbs|transit|bus|mrt|shell|esso|caltex/i, 'Transport'],
  [/singtel|starhub|m1|sp group|utilit|water|electric/i, 'Utilities'],
  [/netflix|spotify|cinema|golden village|cathay|steam|playstation/i, 'Entertainment'],
  [/airline|singapore air|scoot|jetstar|hotel|airbnb|booking/i, 'Travel'],
  [/rent|landlord|hdb|property/i, 'Rent'],
];

function guessCategory(merchant: string): string {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(merchant)) return category;
  }
  return 'Other';
}

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

export default function SpendingPage() {
  const [month, setMonth] = useState(monthKey());
  const [expenses, setExpenses] = useState<api.PersonalExpense[]>([]);
  const [budgets, setBudgets] = useState<api.PersonalBudget[]>([]);
  const [inbox, setInbox] = useState<api.InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');

  // Per-inbox-item category choice, keyed by sk
  const [inboxCategory, setInboxCategory] = useState<Record<string, string>>({});
  const [busySk, setBusySk] = useState<string | null>(null);

  const currency = getDefaultCurrency();

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  function loadMonth(m: string) {
    return api.listPersonal(m).then(setExpenses);
  }

  useEffect(() => {
    Promise.all([
      loadMonth(month),
      api.listBudgets().then(setBudgets),
      api.listInbox().then((items) => {
        setInbox(items);
        // Pre-guess a category for each so the common case is one click.
        const guesses: Record<string, string> = {};
        items.forEach((i) => { guesses[i.sk] = guessCategory(i.merchant); });
        setInboxCategory(guesses);
      }),
    ])
      .catch((e) => addToast((e as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMonth(month).catch((e) => addToast((e as Error).message, 'error'));
  }, [month]);

  /* ── Budget: the newest month at or before this one carries forward ── */
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

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.direction === 'in') continue;
      map.set(e.category, (map.get(e.category) ?? 0) + e.amountMinor);
    }
    return [...map.entries()]
      .map(([category, amountMinor]) => ({ category, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor);
  }, [expenses]);

  const limit = budget?.limitMinor ?? 0;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const over = limit > 0 && spent > limit;

  /* ── Inbox actions ── */

  async function fileItem(item: api.InboxItem) {
    setBusySk(item.sk);
    try {
      await api.addPersonal({
        // The inbox stores major units; everything downstream is minor.
        amountMinor: Math.round(item.amount * 10 ** decimalsFor(item.currency)),
        currency: item.currency,
        merchant: item.merchant,
        category: inboxCategory[item.sk] || 'Other',
        direction: (item as { direction?: string }).direction === 'in' ? 'in' : 'out',
        source: item.source,
        note: item.note,
      });
      await api.dismissInboxItem(item.sk);
      setInbox((prev) => prev.filter((i) => i.sk !== item.sk));
      await loadMonth(month);
      addToast('Filed. 📥');
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setBusySk(null);
    }
  }

  async function dismissItem(sk: string) {
    setBusySk(sk);
    try {
      await api.dismissInboxItem(sk);
      setInbox((prev) => prev.filter((i) => i.sk !== sk));
      addToast('Dismissed.');
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setBusySk(null);
    }
  }

  async function saveBudget() {
    const minor = parseAmountToMinor(budgetDraft || '', currency);
    if (minor === null) { addToast('Enter a plain number, e.g. 1500', 'error'); return; }
    try {
      await api.setBudget(month, minor, currency);
      setBudgets(await api.listBudgets());
      setEditingBudget(false);
      addToast('Budget set. 🎯');
    } catch (e) {
      addToast((e as Error).message, 'error');
    }
  }

  async function removeExpense(sk: string) {
    try {
      await api.deletePersonal(sk);
      setExpenses((prev) => prev.filter((e) => e.sk !== sk));
      addToast('Removed.');
    } catch (e) {
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

      <div className="tracking-header">
        <h1 className="page-title">Spending</h1>
        <p className="page-sub">Your personal budget and where the money goes.</p>
      </div>

      {/* ── Review inbox ── */}
      {inbox.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2 className="card-title">To review</h2>
            <span className="dash-tab-count">{inbox.length}</span>
          </div>
          <ul className="inbox-list">
            {inbox.map((item) => {
              const isIn = (item as { direction?: string }).direction === 'in';
              return (
                <li key={item.sk} className="inbox-row">
                  <div className="inbox-main">
                    <div className="inbox-merchant">
                      {item.merchant}
                      {isIn && <span className="chip" style={{ marginLeft: 8 }}>received</span>}
                    </div>
                    <div className="inbox-meta">
                      {item.source} {item.note && `· ${item.note}`}
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
        </div>
      )}

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

      {/* ── Where it goes ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Where it goes</h2>
        </div>
        {loading ? (
          <p className="sub">Loading…</p>
        ) : byCategory.length === 0 ? (
          <p className="sub">Nothing recorded for {monthLabel(month)} yet.</p>
        ) : (
          <ul className="cat-bars">
            {byCategory.map((c) => {
              const share = spent > 0 ? (c.amountMinor / spent) * 100 : 0;
              return (
                <li key={c.category} className="cat-bar-row">
                  <span className="cat-bar-label">
                    {CATEGORY_EMOJI[c.category] ?? '📦'} {c.category}
                  </span>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: `${share}%` }} />
                  </div>
                  <span className="cat-bar-value">{formatMoney(c.amountMinor, currency)}</span>
                  <span className="cat-bar-pct sub">{Math.round(share)}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Transactions ── */}
      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Transactions</h2>
        </div>
        {loading ? (
          <div className="tracking-empty"><p className="sub">Loading…</p></div>
        ) : expenses.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">🧾</div>
            <p>Nothing here yet.</p>
            <p className="sub">Forwarded bank alerts show up above for review, then land here.</p>
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
    </main>
  );
}