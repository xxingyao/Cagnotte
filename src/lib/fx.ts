/**
 * Cross-currency conversion for display only — never for money the app
 * actually owes anyone. Group balances stay strictly single-currency; this is
 * for portfolio totals, where one approximate combined number is the point.
 */

export interface FxRates {
  base: string;
  rates: Record<string, number>; // 1 USD = rates[code] units of `code`
  fetchedAt: string;
}

/** Converts a MAJOR-unit amount between currencies. Null if either side lacks a rate. */
export function convert(amount: number, from: string, to: string, fx: FxRates): number | null {
  if (from === to) return amount;
  const fromRate = from === fx.base ? 1 : fx.rates[from];
  const toRate = to === fx.base ? 1 : fx.rates[to];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}