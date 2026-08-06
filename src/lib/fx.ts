import { decimalsFor } from './money';

/** USD -> quote rates, as cached in the Rate table by the fx-refresh Lambda. */
export type RateTable = Record<string, number>;

export interface Conversion {
  /** Amount in the target currency, in minor units. */
  amountInBase: number;
  /** Units of target currency per unit of source currency, at conversion time. */
  fxRateUsed: number;
}

/**
 * Converts between two currencies via USD.
 *
 * The rate is recorded alongside the result because an expense must stay
 * reproducible: tomorrow's rates must never silently restate last week's spend.
 */
export function convert(
  amountMinor: number,
  from: string,
  to: string,
  rates: RateTable
): Conversion {
  const source = from.toUpperCase();
  const target = to.toUpperCase();

  if (source === target) return { amountInBase: amountMinor, fxRateUsed: 1 };

  const usdPerSourceUnit = rates[source];
  const usdPerTargetUnit = rates[target];
  if (!usdPerSourceUnit || !usdPerTargetUnit) {
    throw new Error(
      `No cached exchange rate for ${!usdPerSourceUnit ? source : target}. ` +
        'Rates refresh daily — try again shortly.'
    );
  }

  const fxRateUsed = usdPerTargetUnit / usdPerSourceUnit;

  // Minor units differ between currencies (JPY has none), so scale through the
  // major unit rather than multiplying the minor-unit integers directly.
  const sourceMajor = amountMinor / 10 ** decimalsFor(source);
  const targetMinor = sourceMajor * fxRateUsed * 10 ** decimalsFor(target);

  return { amountInBase: Math.round(targetMinor), fxRateUsed };
}

/** Turns Rate rows from the API into the lookup `convert` expects. */
export function toRateTable(
  rows: Array<{ base: string; quote: string; rate: number }>
): RateTable {
  const table: RateTable = {};
  for (const row of rows) {
    if (row.base === 'USD') table[row.quote] = row.rate;
  }
  table.USD ??= 1;
  return table;
}

/** How stale the cache is, for the "rates as of ..." hint in the UI. */
export function ratesAgeInHours(fetchedAt: string | null | undefined): number | null {
  if (!fetchedAt) return null;
  const then = Date.parse(fetchedAt);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 3_600_000;
}
