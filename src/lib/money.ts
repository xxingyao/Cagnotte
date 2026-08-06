/**
 * Money in Cagnotte is always an integer count of *minor units* — cents for USD,
 * whole yen for JPY. Nothing here ever touches a float amount, because repeated
 * float arithmetic on money drifts and splits stop summing to the total.
 */

/** Currencies whose minor unit is not 1/100. Everything else defaults to 2. */
const EXPONENT_OVERRIDES: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  IDR: 0,
  CLP: 0,
  ISK: 0,
  BIF: 0,
  XAF: 0,
  XOF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  JOD: 3,
};

export function decimalsFor(currency: string): number {
  return EXPONENT_OVERRIDES[currency.toUpperCase()] ?? 2;
}

/**
 * Parses user input ("45", "45.5", "1,234.56") into minor units.
 * Throws on anything that isn't a clean, non-negative amount.
 */
export function parseAmount(input: string, currency: string): number {
  const trimmed = input.trim();
  // Grouping is checked before the commas are stripped, so "1,234.56" passes but
  // "5," and "1,23" do not.
  const plain = /^\d+(\.\d+)?$/;
  const grouped = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
  if (!plain.test(trimmed) && !grouped.test(trimmed)) {
    throw new Error(`"${input}" is not a valid amount.`);
  }
  const cleaned = trimmed.replace(/,/g, '');
  const decimals = decimalsFor(currency);
  const [whole, fraction = ''] = cleaned.split('.');
  if (fraction.length > decimals) {
    throw new Error(
      decimals === 0
        ? `${currency} amounts cannot have decimals.`
        : `${currency} amounts have at most ${decimals} decimal places.`
    );
  }
  const padded = fraction.padEnd(decimals, '0');
  const minor = Number(`${whole}${padded}`);
  if (!Number.isSafeInteger(minor)) throw new Error('That amount is too large.');
  return minor;
}

/** Minor units back to a plain decimal string, e.g. 4500 -> "45.00". */
export function toDecimalString(minor: number, currency: string): string {
  const decimals = decimalsFor(currency);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  if (decimals === 0) return `${sign}${abs}`;
  const divisor = 10 ** decimals;
  const whole = Math.floor(abs / divisor);
  const fraction = String(abs % divisor).padStart(decimals, '0');
  return `${sign}${whole}.${fraction}`;
}

/** Localised display string, e.g. "€45.00". Falls back to "45.00 EUR". */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const decimals = decimalsFor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(minor / 10 ** decimals);
  } catch {
    return `${toDecimalString(minor, currency)} ${currency}`;
  }
}
