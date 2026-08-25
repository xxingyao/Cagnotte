import { decimalsFor } from './money';

/**
 * A holding, normalised so that quantity actually drives the numbers.
 *
 * costMinor and valueMinor are totals in the position's own currency. Per-unit
 * figures derive from them, so the two can never contradict each other the way
 * three independently-typed fields could.
 */
export interface Position {
  id: string;
  name: string;
  type: string;
  icon: string;
  currency: string;
  symbol?: string;
  category?: string;
  quantity: number;
  costMinor: number;
  valueMinor: number;
}

export function avgCostMinor(p: Position): number | null {
  return p.quantity > 0 ? p.costMinor / p.quantity : null;
}

export function priceMinor(p: Position): number | null {
  return p.quantity > 0 ? p.valueMinor / p.quantity : null;
}

export function gainMinor(p: Position): number {
  return p.valueMinor - p.costMinor;
}

export function gainPct(p: Position): number | null {
  return p.costMinor > 0 ? (gainMinor(p) / p.costMinor) * 100 : null;
}

export interface CurrencyTotals {
  currency: string;
  costMinor: number;
  valueMinor: number;
  gainMinor: number;
  gainPct: number | null;
  count: number;
}

/**
 * Totals per currency, never summed across them — without exchange rates that
 * produces a confidently wrong number, the same reason computeBalances skips
 * foreign expenses rather than adding them raw.
 */
export function totalsByCurrency(positions: Position[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>();
  for (const p of positions) {
    const t = map.get(p.currency) ?? {
      currency: p.currency,
      costMinor: 0,
      valueMinor: 0,
      gainMinor: 0,
      gainPct: null,
      count: 0,
    };
    t.costMinor += p.costMinor;
    t.valueMinor += p.valueMinor;
    t.count += 1;
    map.set(p.currency, t);
  }
  return [...map.values()]
    .map((t) => ({
      ...t,
      gainMinor: t.valueMinor - t.costMinor,
      gainPct: t.costMinor > 0 ? ((t.valueMinor - t.costMinor) / t.costMinor) * 100 : null,
    }))
    .sort((a, b) => b.valueMinor - a.valueMinor);
}

/**
 * Per-unit prices legitimately carry more precision than the currency's minor
 * unit — a token at 0.000031 would round to zero at 2dp.
 */
export function formatUnitPrice(minor: number | null, currency: string): string {
  if (minor === null) return '—';
  const decimals = decimalsFor(currency);
  const major = minor / 10 ** decimals;
  const places = major !== 0 && Math.abs(major) < 1 ? 6 : Math.max(decimals, 2);
  return `${major.toFixed(places)} ${currency}`;
}

export interface ClosedPosition {
  id: string;
  name: string;
  currency: string;
  quantity: number;
  costMinor: number;
  proceedsMinor: number;
  closedAt: string;
  category?: string;
}
export function realizedGainMinor(c: ClosedPosition): number {
  return c.proceedsMinor - c.costMinor;
}