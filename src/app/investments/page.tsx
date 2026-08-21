'use client';

import { useEffect, useState } from 'react';
import * as api from '@/lib/api';

interface Investment {
  id: string;
  name: string;
  type: string;
  icon: string;
  shares: number;
  costBasis: number;
  currentValue: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ConfirmState {
  message: string;
  onYes: () => void;
}

const ACCOUNT_TYPES = [
  { value: 'brokerage', label: 'Brokerage', icon: '💹' },
  { value: 'retirement', label: 'Retirement (CPF/401k)', icon: '🏛️' },
  { value: 'robo', label: 'Robo-advisor', icon: '🤖' },
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'etf', label: 'ETF / Index Fund', icon: '📊' },
  { value: 'other', label: 'Other', icon: '📁' },
];

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fromWire(w: api.ApiInvestment): Investment {
  return {
    id: w.investmentId,
    name: w.name,
    type: w.type,
    icon: w.icon,
    shares: w.shares,
    costBasis: w.costBasis,
    currentValue: w.currentValue,
  };
}

export default function InvestmentsPage() {
  const [items, setItems] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState('brokerage');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [currentValue, setCurrentValue] = useState('');

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  useEffect(() => {
    api.listInvestments()
      .then((list) => setItems(list.map(fromWire)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalValue = items.reduce((sum, i) => sum + i.currentValue, 0);
  const totalCost = items.reduce((sum, i) => sum + i.costBasis, 0);
  const totalGain = totalValue - totalCost;
  const totalPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  function openAdd() {
    setEditId(null);
    setName('');
    setType('brokerage');
    setShares('');
    setCostBasis('');
    setCurrentValue('');
    setShowModal(true);
  }

  function openEdit(item: Investment) {
    setEditId(item.id);
    setName(item.name);
    setType(item.type);
    setShares(String(item.shares));
    setCostBasis(String(item.costBasis));
    setCurrentValue(String(item.currentValue));
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const icon = ACCOUNT_TYPES.find((t) => t.value === type)?.icon ?? '📁';
    const input = {
      name: name.trim() || 'Untitled',
      type,
      icon,
      shares: parseFloat(shares) || 0,
      costBasis: parseFloat(costBasis) || 0,
      currentValue: parseFloat(currentValue) || 0,
    };
    try {
      if (editId) {
        await api.editInvestment(editId, input);
        setItems((prev) => prev.map((i) => (i.id === editId ? { id: editId, ...input } : i)));
        addToast(pick([
          'Updated! Your portfolio thanks you. 📊',
          "Saved! Numbers don't lie… unless you entered them wrong.",
          'Changes saved! Warren Buffett would be proud. Maybe.',
        ]));
      } else {
        const created = await api.addInvestment(input);
        setItems((prev) => [...prev, fromWire(created)]);
        addToast(pick([
          'Account added! Your financial empire grows. 📈',
          'Added! One step closer to world domination… financially.',
          'New account tracked! Retirement is calling. 🏖️',
        ]));
      }
      setShowModal(false);
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove(item: Investment) {
    setConfirm({
      message: pick([
        `"${item.name}" is about to be liquidated… from your tracker, at least.`,
        `Say goodbye to "${item.name}". Your portfolio won't miss it. Probably.`,
        `Deleting "${item.name}" won't affect your actual money. But it will hurt our feelings.`,
        `"${item.name}" is begging to stay. Are you really this cold?`,
      ]),
      onYes: async () => {
        setConfirm(null);
        try {
          await api.deleteInvestment(item.id);
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          addToast(pick([
            'Deleted! The evidence has been destroyed. 🔥',
            'Gone. Poof. Like your crypto portfolio in 2022.',
            'Removed! One less thing to worry about.',
          ]), 'error');
        } catch (e) {
          addToast((e as Error).message, 'error');
        }
      },
    });
  }

  if (loading) return <p className="sub">Loading…</p>;

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

      <div className="tracking-header">
        <h1 className="page-title">Investments</h1>
        <p className="page-sub">Track your investment accounts and portfolio performance.</p>
      </div>

      {error && (
        <p className="split-hint" style={{ color: 'var(--negative)', marginBottom: 16 }}>{error}</p>
      )}

      <div className="tracking-summary">
        <div className="summary-card">
          <p className="summary-card-label">Total value</p>
          <p className="summary-card-value">${fmt(totalValue)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Total cost basis</p>
          <p className="summary-card-value dim">${fmt(totalCost)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Total gain / loss</p>
          <p className={`summary-card-value ${totalGain >= 0 ? 'pos' : 'neg'}`}>
            {totalGain >= 0 ? '+' : ''}${fmt(totalGain)}
            {totalCost > 0 && (
              <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 8 }}>
                ({totalPct >= 0 ? '+' : ''}{totalPct.toFixed(1)}%)
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Accounts</h2>
          <button type="button" className="tracking-add-btn" onClick={openAdd}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add account
          </button>
        </div>

        {items.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">📈</div>
            <p>No investment accounts yet.</p>
            <p className="sub">Add your brokerage, retirement, or crypto accounts to start tracking.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="hide-mobile">Shares / Units</th>
                  <th className="hide-mobile">Cost basis</th>
                  <th>Current value</th>
                  <th>Gain / Loss</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const gain = item.currentValue - item.costBasis;
                  const pct = item.costBasis > 0 ? (gain / item.costBasis) * 100 : 0;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="tracking-name-cell">
                          <div className="tracking-icon">{item.icon}</div>
                          <div>
                            <div className="tracking-name">{item.name}</div>
                            <div className="tracking-type">
                              {ACCOUNT_TYPES.find((t) => t.value === item.type)?.label}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hide-mobile">{item.shares > 0 ? item.shares : '—'}</td>
                      <td className="hide-mobile">${fmt(item.costBasis)}</td>
                      <td><strong>${fmt(item.currentValue)}</strong></td>
                      <td>
                        <span className={gain >= 0 ? 'pos' : 'neg'}>
                          {gain >= 0 ? '+' : ''}${fmt(gain)}
                          {item.costBasis > 0 && (
                            <span style={{ fontSize: 12, marginLeft: 4 }}>
                              ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="tracking-actions">
                          <button type="button" className="icon-btn icon-btn-sm" onClick={() => openEdit(item)} title="Edit">
                            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                              <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button type="button" className="icon-btn icon-btn-sm is-danger" onClick={() => confirmRemove(item)} title="Delete">
                            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editId ? 'Edit account' : 'Add investment account'}</h2>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setShowModal(false)} aria-label="Close">
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <label className="field">
              <span className="field-label">Account name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tiger Brokerage" />
            </label>
            <label className="field">
              <span className="field-label">Account type</span>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </label>
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Shares / Units</span>
                <input className="input" type="number" step="any" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="0" />
              </label>
              <label className="field">
                <span className="field-label">Cost basis ($)</span>
                <input className="input" type="number" step="0.01" value={costBasis} onChange={(e) => setCostBasis(e.target.value)} placeholder="0.00" />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Current value ($)</span>
              <input className="input" type="number" step="0.01" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="0.00" />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Delete account</h2>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setConfirm(null)} aria-label="Close">
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="modal-message">{confirm.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Nah, keep it</button>
              <button type="button" className="btn btn-danger" onClick={confirm.onYes}>Delete it</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}