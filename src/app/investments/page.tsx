'use client';

import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import { CurrencySelect } from '@/components/CurrencySelect';
import { decimalsFor, formatMoney, parseAmountToMinor } from '@/lib/money';
import { getDefaultCurrency } from '@/lib/prefs';
import {
  Position,
  avgCostMinor,
  formatUnitPrice,
  gainMinor,
  gainPct,
  priceMinor,
  totalsByCurrency,
} from '@/lib/portfolio';

interface Toast { id: number; message: string; type: 'success' | 'error'; }
interface ConfirmState { message: string; onYes: () => void; }

/** Per-unit suits stocks and crypto; total suits CPF, robo, and cash balances. */
type EntryMode = 'unit' | 'total';

const ACCOUNT_TYPES = [
  { value: 'brokerage', label: 'Brokerage', icon: '💹' },
  { value: 'retirement', label: 'Retirement (CPF/401k)', icon: '🏛️' },
  { value: 'robo', label: 'Robo-advisor', icon: '🤖' },
  { value: 'crypto', label: 'Crypto', icon: '₿' },
  { value: 'etf', label: 'ETF / Index Fund', icon: '📊' },
  { value: 'other', label: 'Other', icon: '📁' },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Wire amounts are major units; everything inside this page is minor units. */
function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** decimalsFor(currency));
}

function toMajor(minor: number, currency: string): number {
  return minor / 10 ** decimalsFor(currency);
}

function fromWire(w: api.ApiInvestment, fallbackCurrency: string): Position {
  const currency = w.currency || fallbackCurrency;
  return {
    id: w.investmentId,
    name: w.name,
    type: w.type,
    icon: w.icon,
    currency,
    quantity: w.shares,
    costMinor: toMinor(w.costBasis, currency),
    valueMinor: toMinor(w.currentValue, currency),
  };
}

export default function InvestmentsPage() {
  const [items, setItems] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Form
  const [name, setName] = useState('');
  const [type, setType] = useState('brokerage');
  const [currency, setCurrency] = useState('SGD');
  const [mode, setMode] = useState<EntryMode>('unit');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  useEffect(() => {
    const fallback = getDefaultCurrency();
    setCurrency(fallback);
    api.listInvestments()
      .then((list) => setItems(list.map((w) => fromWire(w, fallback))))
      .catch((e) => addToast((e as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const totals = totalsByCurrency(items);

  /* ── Form ── */

  function resetForm(seed?: Position) {
    setFormError(null);
    if (!seed) {
      setEditId(null);
      setName('');
      setType('brokerage');
      setCurrency(getDefaultCurrency());
      setMode('unit');
      setQuantity('');
      setUnitCost('');
      setUnitPrice('');
      setTotalCost('');
      setTotalValue('');
      return;
    }
    setEditId(seed.id);
    setName(seed.name);
    setType(seed.type);
    setCurrency(seed.currency);
    setMode(seed.quantity > 0 ? 'unit' : 'total');
    setQuantity(seed.quantity > 0 ? String(seed.quantity) : '');

    const avg = avgCostMinor(seed);
    const last = priceMinor(seed);
    const d = decimalsFor(seed.currency);
    setUnitCost(avg === null ? '' : (avg / 10 ** d).toString());
    setUnitPrice(last === null ? '' : (last / 10 ** d).toString());
    setTotalCost(toMajor(seed.costMinor, seed.currency).toString());
    setTotalValue(toMajor(seed.valueMinor, seed.currency).toString());
  }

  function openAdd() { resetForm(); setShowModal(true); }
  function openEdit(item: Position) { resetForm(item); setShowModal(true); }

  /** The single place the form's numbers become a position. Returns null on bad input. */
  function derive(): { quantity: number; costMinor: number; valueMinor: number } | null {
    if (mode === 'total') {
      const cost = parseAmountToMinor(totalCost || '0', currency);
      const value = parseAmountToMinor(totalValue || '0', currency);
      if (cost === null || value === null) {
        setFormError('Amounts must be plain numbers, like 1250.00');
        return null;
      }
      const qty = quantity.trim() ? Number(quantity) : 0;
      if (!Number.isFinite(qty) || qty < 0) {
        setFormError('Units must be zero or more.');
        return null;
      }
      return { quantity: qty, costMinor: cost, valueMinor: value };
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Enter how many units you hold, or switch to Total.');
      return null;
    }
    const cost = parseAmountToMinor(unitCost || '0', currency);
    const price = parseAmountToMinor(unitPrice || '0', currency);
    if (cost === null || price === null) {
      setFormError('Prices must be plain numbers, like 42.50');
      return null;
    }
    // Round once, at the end — rounding per-unit first would drift on big holdings.
    return {
      quantity: qty,
      costMinor: Math.round(cost * qty),
      valueMinor: Math.round(price * qty),
    };
  }

  // Live preview under the per-unit inputs, so the totals are never a surprise.
  const preview = (() => {
    if (mode !== 'unit') return null;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const cost = parseAmountToMinor(unitCost || '0', currency);
    const price = parseAmountToMinor(unitPrice || '0', currency);
    if (cost === null || price === null) return null;
    const costMinor = Math.round(cost * qty);
    const valueMinor = Math.round(price * qty);
    return { costMinor, valueMinor, gain: valueMinor - costMinor };
  })();

  async function save() {
    const derived = derive();
    if (!derived) return;

    setSaving(true);
    setFormError(null);
    const icon = ACCOUNT_TYPES.find((t) => t.value === type)?.icon ?? '📁';
    const position: Omit<Position, 'id'> = {
      name: name.trim() || 'Untitled',
      type,
      icon,
      currency,
      ...derived,
    };
    const wire = {
      name: position.name,
      type: position.type,
      icon: position.icon,
      currency: position.currency,
      shares: position.quantity,
      costBasis: toMajor(position.costMinor, currency),
      currentValue: toMajor(position.valueMinor, currency),
    };

    try {
      if (editId) {
        await api.editInvestment(editId, wire);
        setItems((prev) => prev.map((i) => (i.id === editId ? { id: editId, ...position } : i)));
        addToast(pick([
          'Updated! Your portfolio thanks you. 📊',
          "Saved! Numbers don't lie… unless you entered them wrong.",
          'Changes saved! Warren Buffett would be proud. Maybe.',
        ]));
      } else {
        const created = await api.addInvestment(wire);
        setItems((prev) => [...prev, fromWire(created, currency)]);
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

  function confirmRemove(item: Position) {
    setConfirm({
      message: pick([
        `"${item.name}" is about to be liquidated… from your tracker, at least.`,
        `Say goodbye to "${item.name}". Your portfolio won't miss it. Probably.`,
        `Deleting "${item.name}" won't affect your actual money. But it will hurt our feelings.`,
      ]),
      onYes: async () => {
        setConfirm(null);
        try {
          await api.deleteInvestment(item.id);
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          addToast('Deleted. One less thing to worry about.');
        } catch (e) {
          addToast((e as Error).message, 'error');
        }
      },
    });
  }

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
        <p className="page-sub">Track your holdings and portfolio performance.</p>
      </div>

      {/* ── Totals, one row per currency ── */}
      {loading ? (
        <div className="tracking-summary">
          <div className="summary-card">
            <p className="summary-card-label">Total value</p>
            <p className="summary-card-value">—</p>
          </div>
        </div>
      ) : totals.length === 0 ? null : (
        totals.map((t) => (
          <div className="tracking-summary" key={t.currency}>
            <div className="summary-card">
              <p className="summary-card-label">Value · {t.currency}</p>
              <p className="summary-card-value">{formatMoney(t.valueMinor, t.currency)}</p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Cost basis</p>
              <p className="summary-card-value dim">{formatMoney(t.costMinor, t.currency)}</p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Unrealised P/L</p>
              <p className={`summary-card-value ${t.gainMinor >= 0 ? 'pos' : 'neg'}`}>
                {t.gainMinor >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(t.gainMinor), t.currency)}
                {t.gainPct !== null && (
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 8 }}>
                    ({t.gainPct >= 0 ? '+' : ''}{t.gainPct.toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
          </div>
        ))
      )}

      {totals.length > 1 && (
        <p className="split-hint" style={{ marginTop: -8, marginBottom: 16 }}>
          Currencies are shown separately — converting them would need exchange rates.
        </p>
      )}

      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Holdings</h2>
          <button type="button" className="tracking-add-btn" onClick={openAdd}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add holding
          </button>
        </div>

        {loading ? (
          <div className="tracking-skeleton">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-row">
                <div className="skeleton-block" style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)' }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton-block" style={{ width: '40%', height: 13 }} />
                  <div className="skeleton-block" style={{ width: '25%', height: 11, marginTop: 6 }} />
                </div>
                <div className="skeleton-block" style={{ width: 72, height: 13 }} />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">📈</div>
            <p>No holdings yet.</p>
            <p className="sub">Add a brokerage position, retirement account, or crypto to start tracking.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="hide-mobile">Units</th>
                  <th className="hide-mobile">Avg cost</th>
                  <th className="hide-mobile">Price</th>
                  <th>Value</th>
                  <th>P/L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const gain = gainMinor(item);
                  const pct = gainPct(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="tracking-name-cell">
                          <div className="tracking-icon">{item.icon}</div>
                          <div>
                            <div className="tracking-name">{item.name}</div>
                            <div className="tracking-type">
                              {ACCOUNT_TYPES.find((t) => t.value === item.type)?.label} · {item.currency}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hide-mobile">{item.quantity > 0 ? item.quantity : '—'}</td>
                      <td className="hide-mobile">{formatUnitPrice(avgCostMinor(item), item.currency)}</td>
                      <td className="hide-mobile">{formatUnitPrice(priceMinor(item), item.currency)}</td>
                      <td><strong>{formatMoney(item.valueMinor, item.currency)}</strong></td>
                      <td>
                        <span className={gain >= 0 ? 'pos' : 'neg'}>
                          {gain >= 0 ? '+' : '−'}{formatMoney(Math.abs(gain), item.currency)}
                          {pct !== null && (
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

      {/* ── Add / Edit ── */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editId ? 'Edit holding' : 'Add holding'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label="Close">×</button>
            </div>

            <label className="field">
              <span className="field-label">Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NVIDIA, or CPF Ordinary Account" autoFocus />
            </label>

            <div className="grid-2">
              <label className="field">
                <span className="field-label">Type</span>
                <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Currency</span>
                <CurrencySelect value={currency} onChange={setCurrency} />
              </label>
            </div>

            <div className="field">
              <span className="field-label">How do you want to enter it?</span>
              <div className="theme-toggle">
                <button type="button"
                  className={`theme-toggle-btn${mode === 'unit' ? ' is-active' : ''}`}
                  onClick={() => setMode('unit')}>
                  Per unit
                </button>
                <button type="button"
                  className={`theme-toggle-btn${mode === 'total' ? ' is-active' : ''}`}
                  onClick={() => setMode('total')}>
                  Total
                </button>
              </div>
            </div>

            {mode === 'unit' ? (
              <>
                <label className="field">
                  <span className="field-label">Units held</span>
                  <input className="input" value={quantity} inputMode="decimal"
                    onChange={(e) => setQuantity(e.target.value)} placeholder="100" />
                </label>
                <div className="grid-2">
                  <label className="field">
                    <span className="field-label">Average cost / unit</span>
                    <input className="input" value={unitCost} inputMode="decimal"
                      onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
                  </label>
                  <label className="field">
                    <span className="field-label">Current price / unit</span>
                    <input className="input" value={unitPrice} inputMode="decimal"
                      onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                  </label>
                </div>
                {preview && (
                  <div className="calc-preview">
                    <span>Cost <strong>{formatMoney(preview.costMinor, currency)}</strong></span>
                    <span>Value <strong>{formatMoney(preview.valueMinor, currency)}</strong></span>
                    <span className={preview.gain >= 0 ? 'pos' : 'neg'}>
                      P/L <strong>
                        {preview.gain >= 0 ? '+' : '−'}{formatMoney(Math.abs(preview.gain), currency)}
                      </strong>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid-2">
                  <label className="field">
                    <span className="field-label">Total cost</span>
                    <input className="input" value={totalCost} inputMode="decimal"
                      onChange={(e) => setTotalCost(e.target.value)} placeholder="0.00" />
                  </label>
                  <label className="field">
                    <span className="field-label">Current value</span>
                    <input className="input" value={totalValue} inputMode="decimal"
                      onChange={(e) => setTotalValue(e.target.value)} placeholder="0.00" />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Units held (optional)</span>
                  <input className="input" value={quantity} inputMode="decimal"
                    onChange={(e) => setQuantity(e.target.value)} placeholder="Leave blank for cash-like accounts" />
                </label>
              </>
            )}

            {formError && (
              <p className="split-hint" style={{ color: 'var(--negative)' }}>{formError}</p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add holding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Delete holding</h2>
              <button type="button" className="modal-close" onClick={() => setConfirm(null)} aria-label="Close">×</button>
            </div>
            <p className="modal-message">{confirm.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep it</button>
              <button type="button" className="btn btn-danger" onClick={confirm.onYes}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}