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
type ViewTab = 'open' | 'closed';

const REFRESH_COOLDOWN_MS = 60_000;
const COOLDOWN_KEY = 'cagnotte:last-price-refresh';

/**
 * Investment categories, each rendering as its own section with its own add
 * button — so a holding's category comes from where you added it, never a
 * dropdown.
 *
 * `tradable` → identified by ticker, price auto-fetched.
 * `autoPriced` → price comes from a derived symbol (gold/silver spot).
 * `hasUnits` → false for balance-style holdings like CPF, where "units" is
 *   meaningless and the form asks for amounts directly.
 */
const CATEGORIES: {
  key: string; label: string; icon: string;
  tradable: boolean; autoPriced: boolean; hasUnits: boolean;
  kinds: string[] | null;
}[] = [
  { key: 'stocks', label: 'Stocks & ETFs', icon: '💹', tradable: true, autoPriced: true, hasUnits: true, kinds: null },
  { key: 'crypto', label: 'Crypto', icon: '₿', tradable: false, autoPriced: false, hasUnits: true, kinds: null },
  { key: 'metals', label: 'Precious Metals', icon: '🪙', tradable: false, autoPriced: true, hasUnits: true, kinds: ['Paper Gold', 'Physical Gold', 'Paper Silver', 'Physical Silver'] },
  { key: 'collectibles', label: 'Collectibles', icon: '🎴', tradable: false, autoPriced: false, hasUnits: true, kinds: ['Trading Cards (e.g. Pokémon)', 'Watches', 'Art', 'Other Collectible'] },
  { key: 'retirement', label: 'Retirement', icon: '🏛️', tradable: false, autoPriced: false, hasUnits: false, kinds: ['CPF Ordinary Account', 'CPF Special Account', 'CPF MediSave', '401(k)', 'IRA', 'Other Retirement'] },
  { key: 'robo', label: 'Robo-advisor', icon: '🤖', tradable: false, autoPriced: false, hasUnits: false, kinds: null },
  { key: 'other', label: 'Other', icon: '📁', tradable: false, autoPriced: false, hasUnits: false, kinds: null },
];

function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Rows created before categories existed get sorted by their old `type` slug.
function inferCategory(p: { category?: string; symbol?: string; type: string }): string {
  if (p.category) return p.category;
  if (p.symbol) return 'stocks';
  const t = (p.type || '').toLowerCase();
  if (t.includes('crypto')) return 'crypto';
  if (t.includes('gold') || t.includes('silver')) return 'metals';
  if (t.includes('retirement') || t.includes('cpf') || t.includes('401')) return 'retirement';
  if (t.includes('robo')) return 'robo';
  return 'other';
}

const LEGACY_TYPE_LABELS: Record<string, string> = {
  brokerage: 'Brokerage', retirement: 'Retirement (CPF/401k)', robo: 'Robo-advisor',
  crypto: 'Crypto', etf: 'ETF / Index Fund', other: 'Other',
};
function displayType(type: string): string {
  return LEGACY_TYPE_LABELS[type] ?? type;
}

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
    category: w.category || undefined,
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
    category: w.category || undefined,
  };
}

export default function InvestmentsPage() {
  const [items, setItems] = useState<Position[]>([]);
  const [closed, setClosed] = useState<ClosedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('open');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [history, setHistory] = useState<api.HistoryPoint[]>([]);
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [metalsFetchedAt, setMetalsFetchedAt] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Add / edit
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalCategory, setModalCategory] = useState('stocks');
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [showTickerSearch, setShowTickerSearch] = useState(true);
  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerResults, setTickerResults] = useState<api.TickerResult[]>([]);
  const [searchingTicker, setSearchingTicker] = useState(false);
  const [currency, setCurrency] = useState('SGD');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [priceOverride, setPriceOverride] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Close
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [closeQty, setCloseQty] = useState('');
  const [closeProceeds, setCloseProceeds] = useState('');
  const [proceedsTouched, setProceedsTouched] = useState(false);
  const [closing, setClosing] = useState(false);

  // Edit a closed record
  const [editClosedTarget, setEditClosedTarget] = useState<ClosedPosition | null>(null);
  const [editClosedProceeds, setEditClosedProceeds] = useState('');
  const [savingClosedEdit, setSavingClosedEdit] = useState(false);

  const defaultCurrency = getDefaultCurrency();
  const category = categoryOf(modalCategory);

  function addToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  function reload() {
    const fallback = getDefaultCurrency();
    return api.listInvestments().then((list) => {
      setItems(list.filter((w) => w.status !== 'closed').map((w) => fromWire(w, fallback)));
      setClosed(list.filter((w) => w.status === 'closed').map((w) => closedFromWire(w, fallback)));
    });
  }

  useEffect(() => {
    setCurrency(getDefaultCurrency());
    reload()
      .catch((e) => addToast((e as Error).message, 'error'))
      .finally(() => setLoading(false));
    api.getFxRates().then(setFx).catch(() => {});
    api.getInvestmentHistory(180)
      .then((points) => {
        setHistory(points);
        if (points.length > 0) setChartCurrency((c) => c ?? points[0].currency);
      })
      .catch(() => {});
  }, []);

  /* ── Refresh cooldown ── */
  useEffect(() => {
    const tick = () => {
      let last = 0;
      try { last = Number(localStorage.getItem(COOLDOWN_KEY) || 0); } catch {}
      setCooldownLeft(Math.max(0, REFRESH_COOLDOWN_MS - (Date.now() - last)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Ticker search, debounced ── */
  useEffect(() => {
    if (!category.tradable || !showTickerSearch) return;
    const q = tickerQuery.trim();
    if (!q) { setTickerResults([]); return; }
    setSearchingTicker(true);
    const handle = setTimeout(() => {
      api.searchTickers(q)
        .then(setTickerResults)
        .catch(() => setTickerResults([]))
        .finally(() => setSearchingTicker(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [tickerQuery, category.tradable, showTickerSearch]);

  /* ── Auto-fill current price when a ticker is chosen ── */
  useEffect(() => {
    if (!symbol || priceOverride || !editId === false) return;
  }, [symbol, priceOverride, editId]);

  const combined = useMemo(() => {
    if (!fx) return null;
    let valueMinor = 0, costMinor = 0, skipped = 0;
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
    for (const c of closed) {
      const gain = convert(toMajor(realizedGainMinor(c), c.currency), c.currency, defaultCurrency, fx);
      if (gain === null) continue;
      total += toMinor(gain, defaultCurrency);
    }
    return total;
  }, [closed, fx, defaultCurrency]);

  /** Holdings bucketed into their category, in CATEGORIES order. */
  const grouped = useMemo(() => {
    const map = new Map<string, Position[]>();
    CATEGORIES.forEach((c) => map.set(c.key, []));
    for (const p of items) {
      const key = inferCategory(p);
      map.get(key)?.push(p) ?? map.set(key, [p]);
    }
    return map;
  }, [items]);

  /* ── Refresh all prices ── */

  async function refreshPrices() {
    if (cooldownLeft > 0 || refreshing) return;
    setRefreshing(true);
    try {
      const result = await api.refreshAllQuotes();
      if (result.metalsFetchedAt) setMetalsFetchedAt(result.metalsFetchedAt);
      try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch {}
      await reload();
      if (result.updated.length > 0) {
        addToast(`Updated ${result.updated.length} price${result.updated.length === 1 ? '' : 's'}. 📈`);
      }
      if (result.failed.length > 0) {
        addToast(`No price for: ${result.failed.map((f) => f.symbol).join(', ')}`, 'error');
      }
      if (result.updated.length === 0 && result.failed.length === 0) {
        addToast('Nothing to refresh — no holdings have a price source.', 'error');
      }
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setRefreshing(false);
    }
  }

  /* ── Form ── */

  function openAdd(categoryKey: string) {
    const cat = categoryOf(categoryKey);
    setEditId(null);
    setModalCategory(categoryKey);
    setKind('');
    setName('');
    setSymbol('');
    setShowTickerSearch(cat.tradable);
    setTickerQuery('');
    setTickerResults([]);
    setCurrency(getDefaultCurrency());
    setQuantity(cat.hasUnits ? '' : '1');
    setUnitCost('');
    setUnitPrice('');
    setPriceOverride(!cat.autoPriced);
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(item: Position) {
    const catKey = inferCategory(item);
    const cat = categoryOf(catKey);
    setEditId(item.id);
    setModalCategory(catKey);
    setKind(cat.kinds?.includes(item.type) ? item.type : '');
    setName(item.name);
    setSymbol(item.symbol || '');
    setShowTickerSearch(false);
    setTickerQuery('');
    setTickerResults([]);
    setCurrency(item.currency);
    setQuantity(item.quantity > 0 ? String(item.quantity) : '1');

    const avg = avgCostMinor(item);
    const last = priceMinor(item);
    const d = decimalsFor(item.currency);
    setUnitCost(avg === null ? '' : (avg / 10 ** d).toString());
    setUnitPrice(last === null ? '' : (last / 10 ** d).toString());
    setPriceOverride(true); // editing an existing row always shows the real stored price
    setFormError(null);
    setShowModal(true);
  }

  async function applySymbol(sym: string, label: string) {
    setSymbol(sym);
    setName(label);
    setShowTickerSearch(false);
    setTickerQuery('');
    setTickerResults([]);

    // Pull the live price straight away so the field is filled before saving —
    // no need to save then hit Refresh.
    setFetchingPrice(true);
    try {
      const q = await api.getQuoteBySymbol(sym, currency);
      setUnitPrice(q.price.toFixed(decimalsFor(currency)));
      setPriceOverride(true); // show the real number rather than the "auto" placeholder
    } catch {
      setPriceOverride(true); // let them type it — the lookup didn't land
    } finally {
      setFetchingPrice(false);
    }
  }

  function pickTicker(r: api.TickerResult) {
    void applySymbol(r.symbol, r.name);
  }

  function useManualSymbol() {
    const s = tickerQuery.trim().toUpperCase();
    if (!s) return;
    void applySymbol(s, s);
  }

  const preview = (() => {
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
    if (category.tradable && !symbol) {
      setFormError('Search for a ticker and pick one, or enter the exact symbol yourself.');
      return;
    }
    if (category.kinds && !kind) {
      setFormError(`Choose a ${category.label.toLowerCase()} type.`);
      return;
    }
    if (!category.tradable && !name.trim()) {
      setFormError('Give this holding a name.');
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError(category.hasUnits ? 'Enter how many units you hold.' : 'Something went wrong with the amount.');
      return;
    }
    const cost = parseAmountToMinor(unitCost || '0', currency);
    const price = parseAmountToMinor(unitPrice || '0', currency);
    if (cost === null || price === null) {
      setFormError('Amounts must be plain numbers, like 42.50');
      return;
    }

    setSaving(true);
    setFormError(null);

    const finalType = category.kinds ? kind : category.label;
    const wire = {
      name: category.tradable ? name : name.trim(),
      type: finalType,
      icon: category.icon,
      currency,
      symbol: category.tradable ? symbol : undefined,
      category: category.key,
      shares: qty,
      costBasis: toMajor(Math.round(cost * qty), currency),
      currentValue: toMajor(Math.round(price * qty), currency),
    };

    try {
      if (editId) {
        await api.editInvestment(editId, wire);
        addToast('Updated! Your portfolio thanks you. 📊');
      } else {
        await api.addInvestment(wire);
        addToast(pick([
          'Added! Your financial empire grows. 📈',
          'New holding tracked! Retirement is calling. 🏖️',
          'Added! One step closer to world domination… financially.',
        ]));
      }
      await reload();
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
      message: `Delete the closed record for "${c.name}"? This only removes it from your history.`,
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

  /* ── Close ── */

  function openClose(item: Position) {
    setCloseTarget(item);
    setProceedsTouched(false);
    setCloseQty(item.quantity > 0 ? String(item.quantity) : '');
    setCloseProceeds(toMajor(item.valueMinor, item.currency).toFixed(decimalsFor(item.currency)));
  }

  useEffect(() => {
    if (!closeTarget || proceedsTouched) return;
    const fullQty = closeTarget.quantity > 0 ? closeTarget.quantity : 1;
    const qty = closeTarget.quantity > 0 ? (Number(closeQty) || 0) : fullQty;
    const unitValueMinor = closeTarget.valueMinor / fullQty;
    setCloseProceeds(toMajor(Math.round(unitValueMinor * qty), closeTarget.currency).toFixed(decimalsFor(closeTarget.currency)));
  }, [closeQty, closeTarget, proceedsTouched]);

  async function submitClose() {
    if (!closeTarget) return;
    const proceeds = parseAmountToMinor(closeProceeds || '', closeTarget.currency);
    if (proceeds === null) { addToast('Enter a plain number, e.g. 1500.00', 'error'); return; }
    const qty = closeTarget.quantity > 0 ? Number(closeQty) : undefined;
    if (closeTarget.quantity > 0 && (!Number.isFinite(qty!) || qty! <= 0 || qty! > closeTarget.quantity)) {
      addToast(`Quantity must be between 0 and ${closeTarget.quantity}.`, 'error');
      return;
    }
    setClosing(true);
    try {
      await api.closeInvestment(closeTarget.id, { quantity: qty, proceeds: toMajor(proceeds, closeTarget.currency) });
      await reload();
      setCloseTarget(null);
      addToast(pick([`"${closeTarget.name}" closed. Locked in. 🔒`, 'Position closed! Realized gains, meet reality.']));
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setClosing(false);
    }
  }

  function openEditClosed(c: ClosedPosition) {
    setEditClosedTarget(c);
    setEditClosedProceeds(toMajor(c.proceedsMinor, c.currency).toString());
  }

  async function saveClosedEdit() {
    if (!editClosedTarget) return;
    const proceeds = parseAmountToMinor(editClosedProceeds || '', editClosedTarget.currency);
    if (proceeds === null) { addToast('Enter a plain number, e.g. 1500.00', 'error'); return; }
    setSavingClosedEdit(true);
    try {
      await api.editInvestment(editClosedTarget.id, { proceeds: toMajor(proceeds, editClosedTarget.currency) });
      setClosed((prev) => prev.map((c) => (c.id === editClosedTarget.id ? { ...c, proceedsMinor: proceeds } : c)));
      setEditClosedTarget(null);
      addToast('Realized amount updated.');
    } catch (e) {
      addToast((e as Error).message, 'error');
    } finally {
      setSavingClosedEdit(false);
    }
  }

  const cooldownSecs = Math.ceil(cooldownLeft / 1000);

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
        <h1 className="page-title">Investments</h1>
        <p className="page-sub">Track your holdings and portfolio performance.</p>
      </div>

      {/* ── Totals ── */}
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
            {realizedTotal !== null && closed.length > 0 && (
              <div className="summary-card">
                <p className="summary-card-label">Realized P/L</p>
                <p className={`summary-card-value ${realizedTotal >= 0 ? 'pos' : 'neg'}`}>
                  {realizedTotal >= 0 ? '+' : '−'}{formatMoney(Math.abs(realizedTotal), defaultCurrency)}
                </p>
              </div>
            )}
          </div>
          {combined.skipped > 0 && (
            <p className="split-hint" style={{ marginTop: -8, marginBottom: 16 }}>
              {combined.skipped} holding{combined.skipped === 1 ? '' : 's'} couldn&apos;t be converted and {combined.skipped === 1 ? 'is' : 'are'} excluded above.
            </p>
          )}
        </>
      ) : null}

      {/* ── Chart ── */}
      {history.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2 className="card-title">Value over time</h2></div>
          <PortfolioChart
            points={history.filter((p) => p.currency === chartCurrency).map((p) => ({ date: p.date, value: p.value, cost: p.cost }))}
            currency={chartCurrency ?? defaultCurrency}
          />
        </div>
      )}

      {/* ── Tabs + global refresh ── */}
      <div className="inv-toolbar">
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
        {viewTab === 'open' && (
          <button type="button" className="card-action" onClick={refreshPrices} disabled={refreshing || cooldownLeft > 0}>
            {refreshing ? 'Refreshing…' : cooldownLeft > 0 ? `↻ Wait ${cooldownSecs}s` : '↻ Refresh prices'}
          </button>
        )}

        {viewTab === 'open' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {metalsFetchedAt && (
              <span className="sub">
                Metals: {new Date(metalsFetchedAt).toLocaleDateString()} · refreshes daily
              </span>
            )}
            <button type="button" className="card-action" onClick={refreshPrices} disabled={refreshing || cooldownLeft > 0}>
              {refreshing ? 'Refreshing…' : cooldownLeft > 0 ? `↻ Wait ${cooldownSecs}s` : '↻ Refresh prices'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="tracking-table-wrap" style={{ marginTop: 12 }}>
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
        </div>
      ) : viewTab === 'open' ? (
        /* ── One section per category ── */
        CATEGORIES.map((cat) => {
          const catItems = grouped.get(cat.key) ?? [];
          return (
            <section key={cat.key} className={`cat-section${catItems.length === 0 ? ' is-empty' : ''}`}>
              <div className="cat-divider">
                <span className="cat-divider-icon">{cat.icon}</span>
                <span className="cat-divider-label">{cat.label}</span>
                {catItems.length > 0 && <span className="cat-divider-count">{catItems.length}</span>}
                <button type="button" className="cat-divider-add" onClick={() => openAdd(cat.key)}>
                  + Add
                </button>
              </div>

              {catItems.length > 0 && (
                <div className="tracking-table-wrap">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tracking-table">
                      <thead>
                        <tr>
                          <th>Holding</th>
                          <th className="hide-mobile">{cat.hasUnits ? 'Units' : ''}</th>
                          <th className="hide-mobile">Avg cost</th>
                          <th className="hide-mobile">Price</th>
                          <th>Value</th>
                          <th>P/L</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {catItems.map((item) => {
                          const gain = gainMinor(item);
                          const pct = gainPct(item);
                          return (
                            <tr key={item.id}>
                              <td>
                                <div className="tracking-name-cell">
                                  <div className="tracking-icon">{item.icon}</div>
                                  <div className="tracking-name-text">
                                    <div className="tracking-name">
                                      {item.name}
                                      {item.symbol && <span className="ticker-chip">{item.symbol}</span>}
                                    </div>
                                    <div className="tracking-type">{displayType(item.type)} · {item.currency}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="hide-mobile">{cat.hasUnits && item.quantity > 0 ? item.quantity : '—'}</td>
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
                                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => openEdit(item)} title="Edit">
                                    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                                      <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </button>
                                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => openClose(item)} title="Close position">
                                    {/* Arrow leaving a box — "exit this position" */}
                                    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                                      <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                      <path d="M12.5 6.5 17 10l-4.5 3.5M17 10H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
                </div>
              )}
            </section>
          );
        })
      ) : closed.length === 0 ? (
        <div className="tracking-table-wrap" style={{ marginTop: 12 }}>
          <div className="tracking-empty">
            <div className="tracking-empty-icon">🔒</div>
            <p>Nothing closed yet.</p>
            <p className="sub">Close a holding to record its realized gain or loss here.</p>
          </div>
        </div>
      ) : (
        <div className="tracking-table-wrap" style={{ marginTop: 12 }}>
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
                          <button type="button" className="icon-btn icon-btn-sm" onClick={() => openEditClosed(c)} title="Edit realized amount">
                            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                              <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
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
        </div>
      )}

      {/* ── Add / Edit ── */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">
                {category.icon} {editId ? 'Edit' : 'Add'} · {category.label}
              </h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label="Close">×</button>
            </div>

            {category.kinds && (
              <label className="field">
                <span className="field-label">Type</span>
                <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="" disabled>Choose one…</option>
                  {category.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            )}

            {category.tradable ? (
              showTickerSearch ? (
                <div className="field">
                  <span className="field-label">Ticker symbol</span>
                  <input className="input" value={tickerQuery} onChange={(e) => setTickerQuery(e.target.value)}
                    placeholder="Search — e.g. NVIDIA, AAPL, D05.SI" autoFocus />
                  {searchingTicker && <p className="split-hint" style={{ marginTop: 6 }}>Searching…</p>}
                  {!searchingTicker && tickerResults.length > 0 && (
                    <ul className="ticker-list">
                      {tickerResults.map((r) => (
                        <li key={r.symbol}>
                          <button type="button" className="ticker-pick" onClick={() => pickTicker(r)}>
                            <span className="ticker-sym">{r.symbol}</span>
                            <span className="ticker-name">{r.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tickerQuery.trim() && (
                    <p className="split-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                      Not listed?{' '}
                      <button type="button" className="link-btn" onClick={useManualSymbol}>
                        Use &quot;{tickerQuery.trim().toUpperCase()}&quot; exactly
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="field">
                  <span className="field-label">Ticker symbol</span>
                  <div className="ticker-chosen">
                    <span className="ticker-sym">{symbol}</span>
                    <span className="ticker-name">{name}</span>
                    <button type="button" className="link-btn" onClick={() => setShowTickerSearch(true)}>Change</button>
                  </div>
                </div>
              )
            ) : (
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={category.kinds ? 'e.g. 1oz Gold Bar' : 'e.g. Tiger Brokerage'} autoFocus />
              </label>
            )}

            <label className="field">
              <span className="field-label">Currency</span>
              <CurrencySelect value={currency} onChange={setCurrency} />
            </label>

            {category.hasUnits && (
              <label className="field">
                <span className="field-label">Units held</span>
                <input className="input" value={quantity} inputMode="decimal"
                  onChange={(e) => setQuantity(e.target.value)} placeholder="100" />
              </label>
            )}

            <div className="grid-2">
              <label className="field">
                <span className="field-label">{category.hasUnits ? 'Average cost / unit' : 'Amount invested'}</span>
                <input className="input" value={unitCost} inputMode="decimal"
                  onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
              </label>
              <label className="field">
                <span className="field-label">
                  {category.hasUnits ? 'Current price / unit' : 'Current value'}
                  {category.autoPriced && !priceOverride && <span className="field-hint"> · auto</span>}
                </span>
                {category.autoPriced && !priceOverride ? (
                  <div className="auto-price">
                    <span className="sub">Fetched on refresh</span>
                    <button type="button" className="link-btn" onClick={() => setPriceOverride(true)}>Set manually</button>
                  </div>
                ) : (
                  <input className="input" value={fetchingPrice ? 'Fetching…' : unitPrice} inputMode="decimal"
                    disabled={fetchingPrice}
                    onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                )}
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

            {category.autoPriced && !priceOverride && (
              <p className="split-hint">
                Leave the price blank and hit <strong>↻ Refresh prices</strong> after saving — it&apos;ll fill in automatically.
              </p>
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

      {/* ── Close ── */}
      {closeTarget && (
        <div className="modal-backdrop" onClick={() => setCloseTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Close &quot;{closeTarget.name}&quot;</h2>
              <button type="button" className="modal-close" onClick={() => setCloseTarget(null)} aria-label="Close">×</button>
            </div>
            <p className="modal-message">
              Proceeds default to this position&apos;s current value. Edit it if the actual sale differed.
            </p>
            {closeTarget.quantity > 0 && (
              <label className="field">
                <span className="field-label">Units to close (of {closeTarget.quantity})</span>
                <input className="input" value={closeQty} inputMode="decimal" onChange={(e) => setCloseQty(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span className="field-label">Total proceeds</span>
              <input className="input" value={closeProceeds} inputMode="decimal"
                onChange={(e) => { setCloseProceeds(e.target.value); setProceedsTouched(true); }} />
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

      {/* ── Edit closed ── */}
      {editClosedTarget && (
        <div className="modal-backdrop" onClick={() => setEditClosedTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Edit &quot;{editClosedTarget.name}&quot;</h2>
              <button type="button" className="modal-close" onClick={() => setEditClosedTarget(null)} aria-label="Close">×</button>
            </div>
            <label className="field">
              <span className="field-label">Actual proceeds received</span>
              <input className="input" value={editClosedProceeds} inputMode="decimal"
                onChange={(e) => setEditClosedProceeds(e.target.value)} autoFocus />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditClosedTarget(null)}>Cancel</button>
              <button type="button" className="btn" onClick={saveClosedEdit} disabled={savingClosedEdit}>
                {savingClosedEdit ? 'Saving…' : 'Save'}
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