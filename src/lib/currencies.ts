/** Currencies offered in the UI. Must stay a subset of the fx-refresh Lambda's list. */
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'TWD', name: 'New Taiwan Dollar' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'TRY', name: 'Turkish Lira' },
] as const;

export const CATEGORIES = [
  'FOOD',
  'GROCERIES',
  'RENT',
  'TRANSPORT',
  'UTILITIES',
  'ENTERTAINMENT',
  'TRAVEL',
  'OTHER',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Other';
  return category.charAt(0) + category.slice(1).toLowerCase();
}

export const CATEGORY_EMOJI: Record<string, string> = {
  FOOD: '🍜',
  GROCERIES: '🛒',
  RENT: '🏠',
  TRANSPORT: '🚌',
  UTILITIES: '💡',
  ENTERTAINMENT: '🎟️',
  TRAVEL: '✈️',
  OTHER: '📦',
};
