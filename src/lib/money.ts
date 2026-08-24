import { currencyInfo } from './currencies';

/**
 * Minor-unit exponent. Most currencies are 2, but JPY/VND/KRW and the CFA
 * francs are 0, and the Gulf dinars are 3 — getting this wrong stores amounts
 * at the wrong scale.
 */
export function decimalsFor(currency: string): number {
  return currencyInfo(currency)?.decimals ?? 2;
}

/** "45.50" -> 4550. Returns null if the input isn't a clean amount. */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const decimals = decimalsFor(currency);
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return null;

  return Number(whole + fraction.padEnd(decimals, '0'));
}

export function formatMoney(minor: number, currency: string): string {
  const decimals = decimalsFor(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(minor / 10 ** decimals);
  } catch {
    return `${(minor / 10 ** decimals).toFixed(decimals)} ${currency}`;
  }
}

/** Inverse of parseAmountToMinor — turns 4550/"EUR" back into "45.50" for an editable field. */
export function minorToAmountString(minor: number, currency: string): string {
  const decimals = decimalsFor(currency);
  return (minor / 10 ** decimals).toFixed(decimals);
}