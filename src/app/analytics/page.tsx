'use client';

import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { getDefaultCurrency } from '@/lib/prefs';
import { CATEGORY_EMOJI } from '@/lib/options';

type Tab = 'overview' | 'categories' | 'trends';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'categories', label: 'Categories', icon: '🗂️' },
  { key: 'trends', label: 'Trends', icon: '📈' },
];

const MONTHS_BACK = 6;

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString(undefined, { month: 'short' });
}

function longMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [expenses, setExpenses] = useState<api.PersonalExpense[]>([]);
  const [budgets, setBudgets] = useState<api.PersonalBudget[]>([]);
  const [loading, setLoading] = useState(true);

  const currency = getDefaultCurrency();
  const thisMonth = monthKey();
  const firstMonth = shiftMonth(thisMonth, -(MONTHS_BACK - 1));

  useEffect(() => {
    Promise.all([
      api.listPersonalRange(firstMonth, thisMonth).then(setExpenses),
      api.listPersonalBudgets().then(setBudgets),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));

    void api.listPersonalRange(firstMonth, thisMonth, { fresh: true }).then(setExpenses).catch(() => {});
    void api.listPersonalBudgets({ fresh: true }).then(setBudgets).catch(() => {});
  }, [firstMonth, thisMonth]);

  /** Spend only — money received isn't spending and would distort every total. */
  const outgoing = useMemo(() => expenses.filter((e) => e.direction !== 'in'), [expenses]);

  const months = useMemo(
    () => Array.from({ length: MONTHS_BACK }, (_, i) => shiftMonth(thisMonth, -(MONTHS_BACK - 1 - i))),
    [thisMonth],
  );

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    months.forEach((m) => map.set(m, 0));
    for (const e of outgoing) {
      const m = e.date.slice(0, 7);
      if (map.has(m)) map.set(m, (map.get(m) ?? 0) + e.amountMinor);
    }
    return months.map((m) => ({ month: m, total: map.get(m) ?? 0 }));
  }, [outgoing, months]);

  const currentTotal = byMonth[byMonth.length - 1]?.total ?? 0;
  const previousTotal = byMonth[byMonth.length - 2]?.total ?? 0;
  const delta = currentTotal - previousTotal;

  const monthsWithSpend = byMonth.filter((m) => m.total > 0);
  const average = monthsWithSpend.length
    ? Math.round(monthsWithSpend.reduce((s, m) => s + m.total, 0) / monthsWithSpend.length)
    : 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of outgoing) {
      if (!e.date.startsWith(thisMonth)) continue;
      map.set(e.category, (map.get(e.category) ?? 0) + e.amountMinor);
    }
    return [...map.entries()]
      .map(([category, amountMinor]) => ({ category, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor);
  }, [outgoing, thisMonth]);

  /** Same categories over the whole window, for the all-time view. */
  const byCategoryAllTime = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of outgoing) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amountMinor);
    }
    return [...map.entries()]
      .map(([category, amountMinor]) => ({ category, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor);
  }, [outgoing]);

  const budget = useMemo(() => {
    const applicable = budgets
      .filter((b) => b.month <= thisMonth)
      .sort((a, b) => b.month.localeCompare(a.month));
    return applicable[0] ?? null;
  }, [budgets, thisMonth]);

  const limit = budget?.limitMinor ?? 0;
  const monthTotal = byCategory.reduce((s, c) => s + c.amountMinor, 0);
  const peak = Math.max(...byMonth.map((m) => m.total), 1);

  return (
    <main>
      <h1 className="page-title">Analytics</h1>

      <div className="dash-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button"
            className={`dash-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}>
            <span className="dash-tab-icon">{t.icon}</span>
            <span className="dash-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card"><p className="sub">Loading…</p></div>
      ) : outgoing.length === 0 ? (
        <div className="tracking-empty">
          <div className="tracking-empty-icon">📊</div>
          <p>Nothing to analyse yet.</p>
          <p className="sub">Add a few transactions in Budget and they&apos;ll show up here.</p>
        </div>
      ) : tab === 'overview' ? (
        <>
          <div className="tracking-summary">
            <div className="summary-card">
              <p className="summary-card-label">{longMonth(thisMonth)}</p>
              <p className="summary-card-value">{formatMoney(currentTotal, currency)}</p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">vs last month</p>
              <p className={`summary-card-value ${delta > 0 ? 'neg' : delta < 0 ? 'pos' : 'dim'}`}>
                {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta), currency)}`}
              </p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Monthly average</p>
              <p className="summary-card-value dim">{formatMoney(average, currency)}</p>
            </div>
          </div>

          {limit > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><h2 className="card-title">Against budget</h2></div>
              <div className="meter">
                <div className={`meter-fill${monthTotal > limit ? ' is-over' : monthTotal / limit > 0.8 ? ' is-warn' : ''}`}
                  style={{ width: `${Math.min(100, (monthTotal / limit) * 100)}%` }} />
              </div>
              <div className="budget-foot">
                <span>{formatMoney(monthTotal, currency)} of {formatMoney(limit, currency)}</span>
                <span className={monthTotal > limit ? 'neg' : 'pos'}>
                  {monthTotal > limit
                    ? `${formatMoney(monthTotal - limit, currency)} over`
                    : `${formatMoney(limit - monthTotal, currency)} left`}
                </span>
              </div>
            </div>
          )}

          {byCategory.length > 0 && (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Biggest this month</h2></div>
              <ul className="cat-bars">
                {byCategory.slice(0, 3).map((c) => {
                  const share = monthTotal > 0 ? (c.amountMinor / monthTotal) * 100 : 0;
                  return (
                    <li key={c.category} className="cat-bar-row">
                      <span className="cat-bar-label">{CATEGORY_EMOJI[c.category] ?? '📦'} {c.category}</span>
                      <div className="cat-bar-track">
                        <div className="cat-bar-fill" style={{ width: `${share}%` }} />
                      </div>
                      <span className="cat-bar-value">{formatMoney(c.amountMinor, currency)}</span>
                      <span className="cat-bar-pct sub">{Math.round(share)}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : tab === 'categories' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><h2 className="card-title">{longMonth(thisMonth)}</h2></div>
            {byCategory.length === 0 ? (
              <p className="sub">Nothing recorded this month.</p>
            ) : (
              <ul className="cat-bars">
                {byCategory.map((c) => {
                  const share = monthTotal > 0 ? (c.amountMinor / monthTotal) * 100 : 0;
                  return (
                    <li key={c.category} className="cat-bar-row">
                      <span className="cat-bar-label">{CATEGORY_EMOJI[c.category] ?? '📦'} {c.category}</span>
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

          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Last {MONTHS_BACK} months</h2>
            </div>
            <ul className="cat-bars">
              {byCategoryAllTime.map((c) => {
                const total = byCategoryAllTime.reduce((s, x) => s + x.amountMinor, 0);
                const share = total > 0 ? (c.amountMinor / total) * 100 : 0;
                return (
                  <li key={c.category} className="cat-bar-row">
                    <span className="cat-bar-label">{CATEGORY_EMOJI[c.category] ?? '📦'} {c.category}</span>
                    <div className="cat-bar-track">
                      <div className="cat-bar-fill" style={{ width: `${share}%` }} />
                    </div>
                    <span className="cat-bar-value">{formatMoney(c.amountMinor, currency)}</span>
                    <span className="cat-bar-pct sub">{Math.round(share)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Monthly spend</h2>
            {limit > 0 && <span className="sub">budget {formatMoney(limit, currency)}</span>}
          </div>

          <div className="trend-chart">
            {byMonth.map((m) => {
              const height = peak > 0 ? (m.total / peak) * 100 : 0;
              const overBudget = limit > 0 && m.total > limit;
              return (
                <div key={m.month} className="trend-col">
                  <div className="trend-bar-wrap">
                    {limit > 0 && (
                      <div className="trend-budget-line"
                        style={{ bottom: `${Math.min(100, (limit / peak) * 100)}%` }} />
                    )}
                    <div className={`trend-bar${overBudget ? ' is-over' : ''}`}
                      style={{ height: `${height}%` }}
                      title={formatMoney(m.total, currency)} />
                  </div>
                  <div className="trend-label">{shortMonth(m.month)}</div>
                  <div className="trend-value">{formatMoney(m.total, currency)}</div>
                </div>
              );
            })}
          </div>

          {limit > 0 && (
            <p className="split-hint" style={{ marginTop: 14, marginBottom: 0 }}>
              The dashed line is your current budget. Bars above it are months you went over.
            </p>
          )}
        </div>
      )}
    </main>
  );
}