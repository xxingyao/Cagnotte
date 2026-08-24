'use client';

import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { CurrencySelect } from '@/components/CurrencySelect';
import { decimalsFor, formatMoney, parseAmountToMinor } from '@/lib/money';
import { getDefaultCurrency } from '@/lib/prefs';
import { convert, type FxRates } from '@/lib/fx';
import { PortfolioChart } from '@/components/PortfolioChart';
import {
  Position,
  ClosedPosition,
  avgCostMinor,
  formatUnitPrice,
  gainMinor,
  gainPct,
  priceMinor,
  realizedGainMinor,
} from '@/lib/portfolio';

interface Toast { id: number; message: string; type: 'success' | 'error'; }
interface ConfirmState { message: string; onYes: () => void; }
type EntryMode = 'unit' | 'total';
type ViewTab = 'open' | 'closed';

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
    symbol: w.symbol || undefined,
    quantity: w.shares,
    costMinor: toMinor(w.costBasis, currency),
    valueMinor: toMinor(w.currentValue, currency),
  };
}

function closedFromWire(w: api.ApiInvestment, fallbackCurrency: string): ClosedPosition {
  const currency = w.currency || fallbackCurrency;
  return {
    id: w.investmentId,
    name: w.name,
    currency,
    quantity: w.shares,
    costMinor: toMinor(w.costBasis, currency),
    proceedsMinor: toMinor(w.proceeds ?? 0, currency),
    closedAt: w.closedAt || '',
  };
}

export default function InvestmentsPage() {
  const [items, setItems] = useState<Position[]>([]);
  const [closed, setClosed] = useState<ClosedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('open');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [closeQty, setCloseQty] = useState('');
  const [closeProceeds, setCloseProceeds] = useState('');
  const [closing, setClosing] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [history, setHistory] = useState<api.HistoryPoint[]>([]);
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('brokerage');
  const [currency, setCurrency] = useState('SGD');
  const [mode, setMode] = useState<EntryMode>('unit');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const defaultCurrency = getDefaultCurrency();

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  useEffect(() => {
    const fallback = getDefaultCurrency();
    setCurrency(fallback);

    api.listInvestments()
      .then((list) => {
        setItems(list.filter((w) => w.status !== 'closed').map((w) => fromWire(w, fallback)));
        setClosed(list.filter((w) => w.status === 'closed').map((w) => closedFromWire(w, fallback)));
      })
      .catch((e) => addToast((e as Error).message, 'error'))
      .finally(() => setLoading(false));

    // A missing rate just means the combined total doesn't render — not fatal.
    api.getFxRates().then(setFx).catch(() => {});

    api.getInvestmentHistory(180)
      .then((points) => {
        setHistory(points);
        if (points.length > 0) setChartCurrency((c) => c ?? points[0].currency);
      })
      .catch(() => {});
  }, []);

  /* ── Combined total in the user's default currency ── */

  const combined = useMemo(() => {
    if (!fx) return null;
    let valueMinor = 0;
    let costMinor = 0;
    let skipped = 0;
    for (const p of items) {
      const value = convert(toMajor(p.valueMinor, p.currency), p.currency, defaultCurrency, fx);
      const cost = convert(toMajor(p.costMinor, p.currency), p.currency, defaultCurrency, fx);
      if (value === null || cost === null) { skipped += 1; continue; }
      valueMinor += toMinor(value, defaultCurrency);
      costMinor += toMinor(cost, defaultCurrency);
    }
    return { valueMinor, costMinor, gainMinor: valueMinor - costMinor, skipped };
  }, [items, fx, defaultCurrency]);

  const realizedTotal = useMemo(() => {
    if (!fx) return null;
    let total = 0;
    let skipped = 0;
    for (const c of closed) {
      const gain = convert(toMajor(realizedGainMinor(c), c.currency), c.currency, defaultCurrency, fx);
      if (gain === null) { skipped += 1; continue; }
      total += toMinor(gain, defaultCurrency);
    }
    return { totalMinor: total, skipped };
  }, [closed, fx, defaultCurrency]);

  /* ── Form ── */

  function resetForm(seed?: Position) {
    setFormError(null);
    if (!seed) {
      setEditId(null);
      setName('');
      setSymbol('');
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
    setSymbol(seed.symbol || '');
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
    return { quantity: qty, costMinor: Math.round(cost * qty), valueMinor: Math.round(price * qty) };
  }

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
      type, icon, currency,
      symbol: symbol.trim() || undefined,
      ...derived,
    };
    const wire = {
      name: position.name,
      type: position.type,
      icon: position.icon,
      currency: position.currency,
      symbol: position.symbol,
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

    function confirmRemoveClosed(c: ClosedPosition) {
    setConfirm({
      message: pick([
        `Delete the closed record for "${c.name}"? This only removes it from your history.`,
        `"${c.name}" will disappear from your closed positions. The trade itself already happened — this just tidies the log.`,
        `Removing this closed record. Doesn't undo the sale, just cleans up the list.`,
      ]),
      onYes: async () => {
        setConfirm(null);
        try {
          await api.deleteInvestment(c.id);
          setClosed((prev) => prev.filter((x) => x.id !== c.id));
          addToast('Closed record removed.');
        } catch (e) {
          addToast((e as Error).message, 'error');
        }
      },
    });
  }

  /* ── Close position ── */

  function openClose(item: Position) {
    setCloseTarget(item);
    setCloseQty(item.quantity > 0 ? String(item.quantity) : '');
    setCloseProceeds('');
  }

  async function submitClose() {
    if (!closeTarget) return;
    const proceeds = parseAmountToMinor(closeProceeds || '', closeTarget.currency);
    if (proceeds === null) {
      addToast('Enter the total amount you received, e.g. 1500.00', 'error');
      return;
    }
    const qty = closeTarget.quantity > 0 ? Number(closeQty) : undefined;
    if (closeTarget.quantity > 0 && (!Number.isFinite(qty!) || qty! <= 0 || qty! > closeTarget.quantity)) {
      addToast(`Quantity must be between 0 and ${closeTarget.quantity}.`, 'error');
      return;
    }

    setClosing(true);
    try {
      await api.closeInvestment(closeTarget.id, {
        quantity: qty,
        proceeds: toMajor(proceeds, closeTarget.currency),
      });
      // Re-pull everything rather than reconstruct the partial-close math
      // client-side and risk drifting from what the server actually stored.
      const fallback = getDefaultCurrency();
      const list = await api.listInvestments();
      setItems(list.filter((w) => w.status !== 'closed').map((w) => fromWire(w, fallback)));
      setClosed(list.filter((w) => w.status === 'closed').map((w) => closedFromWire(w, fallback)));
      setCloseTarget(null);
      addToast(pick([
        `"${closeTarget.name}" closed. That's locked in now. 🔒`,
        'Position closed! Realized gains, meet reality.',
        'Sold and settled. On to the next one.',
      ]));
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setClosing(false);
    }
  }

  /* ── Live quote ── */

  async function refreshQuote(item: Position) {
    if (!item.symbol) return;
    setRefreshingId(item.id);
    try {
      const { price } = await api.getInvestmentQuote(item.id);
      const priceMinorValue = toMinor(price, item.currency);
      const newValueMinor = Math.round(priceMinorValue * item.quantity);
      await api.editInvestment(item.id, {
        name: item.name, type: item.type, icon: item.icon, currency: item.currency, symbol: item.symbol,
        shares: item.quantity,
        costBasis: toMajor(item.costMinor, item.currency),
        currentValue: toMajor(newValueMinor, item.currency),
      });
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, valueMinor: newValueMinor } : p)));
      addToast(`${item.symbol}: ${formatMoney(priceMinorValue, item.currency)}/share`);
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setRefreshingId(null);
    }
  }

  async function refreshAll() {
    const quotable = items.filter((i) => i.symbol);
    if (quotable.length === 0) {
      addToast('No holdings have a ticker symbol set yet.', 'error');
      return;
    }
    setRefreshingAll(true);
    // Sequential, not Promise.all — free-tier quote APIs cap requests per
    // minute, and a burst of parallel calls is the fastest way to get rate-limited.
    for (const item of quotable) {
      await refreshQuote(item);
      await new Promise((r) => setTimeout(r, 300));
    }
    setRefreshingAll(false);
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

      {/* ── Combined totals, in your default currency ── */}
      {loading ? (
        <div className="tracking-summary">
          <div className="summary-card"><p className="summary-card-label">Total value</p><p className="summary-card-value">—</p></div>
        </div>
      ) : !fx ? (
        <p className="split-hint" style={{ marginBottom: 16 }}>
          Couldn&apos;t load exchange rates — combined totals aren&apos;t available right now.
        </p>
      ) : combined ? (
        <>
          <div className="tracking-summary">
            <div className="summary-card">
              <p className="summary-card-label">Total value · {defaultCurrency}</p>
              <p className="summary-card-value">{formatMoney(combined.valueMinor, defaultCurrency)}</p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Cost basis</p>
              <p className="summary-card-value dim">{formatMoney(combined.costMinor, defaultCurrency)}</p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Unrealized P/L</p>
              <p className={`summary-card-value ${combined.gainMinor >= 0 ? 'pos' : 'neg'}`}>
                {combined.gainMinor >= 0 ? '+' : '−'}{formatMoney(Math.abs(combined.gainMinor), defaultCurrency)}
              </p>
            </div>
            {realizedTotal && closed.length > 0 && (
              <div className="summary-card">
                <p className="summary-card-label">Realized P/L</p>
                <p className={`summary-card-value ${realizedTotal.totalMinor >= 0 ? 'pos' : 'neg'}`}>
                  {realizedTotal.totalMinor >= 0 ? '+' : '−'}{formatMoney(Math.abs(realizedTotal.totalMinor), defaultCurrency)}
                </p>
              </div>
            )}
          </div>
          {combined.skipped > 0 && (
            <p className="split-hint" style={{ marginTop: -8, marginBottom: 16 }}>
              {combined.skipped} holding{combined.skipped === 1 ? '' : 's'} couldn&apos;t be converted (no rate for that currency) and {combined.skipped === 1 ? 'is' : 'are'} excluded above.
            </p>
          )}
        </>
      ) : null}

      {/* ── Chart ── */}
      {history.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2 className="card-title">Value over time</h2>
          </div>
          <PortfolioChart
            points={history.filter((p) => p.currency === chartCurrency).map((p) => ({ date: p.date, value: p.value, cost: p.cost }))}
            currency={chartCurrency ?? defaultCurrency}
          />
        </div>
      )}

      {/* ── Open / Closed tabs ── */}
      <div className="dash-tabs" style={{ marginBottom: 0 }}>
        <button type="button" className={`dash-tab${viewTab === 'open' ? ' is-active' : ''}`} onClick={() => setViewTab('open')}>
          <span className="dash-tab-label">Open</span>
          <span className="dash-tab-count">{items.length}</span>
        </button>
        <button type="button" className={`dash-tab${viewTab === 'closed' ? ' is-active' : ''}`} onClick={() => setViewTab('closed')}>
          <span className="dash-tab-label">Closed</span>
          <span className="dash-tab-count">{closed.length}</span>
        </button>
      </div>

      <div className="tracking-table-wrap" style={{ marginTop: 12 }}>
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">{viewTab === 'open' ? 'Holdings' : 'Closed positions'}</h2>
          {viewTab === 'open' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="card-action" onClick={refreshAll} disabled={refreshingAll}>
                {refreshingAll ? 'Refreshing…' : '↻ Refresh prices'}
              </button>
              <button type="button" className="tracking-add-btn" onClick={openAdd}>
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                  <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Add holding
              </button>
            </div>
          )}
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
        ) : viewTab === 'open' ? (
          items.length === 0 ? (
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
                              <div className="tracking-name">
                                {item.name}
                                {item.symbol && <span className="chip" style={{ marginLeft: 6 }}>{item.symbol}</span>}
                              </div>
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
                            {pct !== null && <span style={{ fontSize: 12, marginLeft: 4 }}>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
                          </span>
                        </td>
                        <td>
                          <div className="tracking-actions">
                            {item.symbol && (
                              <button type="button" className="icon-btn icon-btn-sm" onClick={() => refreshQuote(item)}
                                disabled={refreshingId === item.id} title="Refresh price">
                                {refreshingId === item.id ? '…' : '↻'}
                              </button>
                            )}
                            <button type="button" className="icon-btn icon-btn-sm" onClick={() => openEdit(item)} title="Edit">
                              <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                                <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button type="button" className="icon-btn icon-btn-sm" onClick={() => openClose(item)} title="Close position">
                              🔒
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
          )
        ) : closed.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">🔒</div>
            <p>Nothing closed yet.</p>
            <p className="sub">Close a holding to record its realized gain or loss here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="hide-mobile">Units</th>
                  <th className="hide-mobile">Cost</th>
                  <th>Proceeds</th>
                  <th>Realized P/L</th>
                  <th className="hide-mobile">Closed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closed.map((c) => {
                  const gain = realizedGainMinor(c);
                  return (
                    <tr key={c.id}>
                      <td><div className="tracking-name">{c.name}</div></td>
                      <td className="hide-mobile">{c.quantity > 0 ? c.quantity : '—'}</td>
                      <td className="hide-mobile">{formatMoney(c.costMinor, c.currency)}</td>
                      <td>{formatMoney(c.proceedsMinor, c.currency)}</td>
                      <td>
                        <span className={gain >= 0 ? 'pos' : 'neg'}>
                          {gain >= 0 ? '+' : '−'}{formatMoney(Math.abs(gain), c.currency)}
                        </span>
                      </td>
                      <td className="hide-mobile">{c.closedAt}</td>
                      <td>
                        <div className="tracking-actions">
                          <button type="button" className="icon-btn icon-btn-sm is-danger" onClick={() => confirmRemoveClosed(c)} title="Delete">
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
                  {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Currency</span>
                <CurrencySelect value={currency} onChange={setCurrency} />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Ticker symbol (optional)</span>
              <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. NVDA — enables the ↻ price refresh" />
            </label>

            <div className="field">
              <span className="field-label">How do you want to enter it?</span>
              <div className="theme-toggle">
                <button type="button" className={`theme-toggle-btn${mode === 'unit' ? ' is-active' : ''}`} onClick={() => setMode('unit')}>Per unit</button>
                <button type="button" className={`theme-toggle-btn${mode === 'total' ? ' is-active' : ''}`} onClick={() => setMode('total')}>Total</button>
              </div>
            </div>

            {mode === 'unit' ? (
              <>
                <label className="field">
                  <span className="field-label">Units held</span>
                  <input className="input" value={quantity} inputMode="decimal" onChange={(e) => setQuantity(e.target.value)} placeholder="100" />
                </label>
                <div className="grid-2">
                  <label className="field">
                    <span className="field-label">Average cost / unit</span>
                    <input className="input" value={unitCost} inputMode="decimal" onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
                  </label>
                  <label className="field">
                    <span className="field-label">Current price / unit</span>
                    <input className="input" value={unitPrice} inputMode="decimal" onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                  </label>
                </div>
                {preview && (
                  <div className="calc-preview">
                    <span>Cost <strong>{formatMoney(preview.costMinor, currency)}</strong></span>
                    <span>Value <strong>{formatMoney(preview.valueMinor, currency)}</strong></span>
                    <span className={preview.gain >= 0 ? 'pos' : 'neg'}>
                      P/L <strong>{preview.gain >= 0 ? '+' : '−'}{formatMoney(Math.abs(preview.gain), currency)}</strong>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid-2">
                  <label className="field">
                    <span className="field-label">Total cost</span>
                    <input className="input" value={totalCost} inputMode="decimal" onChange={(e) => setTotalCost(e.target.value)} placeholder="0.00" />
                  </label>
                  <label className="field">
                    <span className="field-label">Current value</span>
                    <input className="input" value={totalValue} inputMode="decimal" onChange={(e) => setTotalValue(e.target.value)} placeholder="0.00" />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Units held (optional)</span>
                  <input className="input" value={quantity} inputMode="decimal" onChange={(e) => setQuantity(e.target.value)} placeholder="Leave blank for cash-like accounts" />
                </label>
              </>
            )}

            {formError && <p className="split-hint" style={{ color: 'var(--negative)' }}>{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add holding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close position ── */}
      {closeTarget && (
        <div className="modal-backdrop" onClick={() => setCloseTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Close &quot;{closeTarget.name}&quot;</h2>
              <button type="button" className="modal-close" onClick={() => setCloseTarget(null)} aria-label="Close">×</button>
            </div>
            <p className="modal-message">
              Record what you actually received. This locks in realized profit or loss —
              it&apos;s kept separate from the unrealized total above.
            </p>
            {closeTarget.quantity > 0 && (
              <label className="field">
                <span className="field-label">Units to close (of {closeTarget.quantity})</span>
                <input className="input" value={closeQty} inputMode="decimal" onChange={(e) => setCloseQty(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span className="field-label">Total proceeds received</span>
              <input className="input" value={closeProceeds} inputMode="decimal"
                onChange={(e) => setCloseProceeds(e.target.value)} placeholder="0.00" autoFocus />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCloseTarget(null)}>Cancel</button>
              <button type="button" className="btn" onClick={submitClose} disabled={closing}>
                {closing ? 'Closing…' : 'Close position'}
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