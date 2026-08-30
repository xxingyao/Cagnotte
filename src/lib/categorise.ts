import { MerchantRule } from './api';

/**
 * Keyword fallbacks for a merchant we've never seen. Only ever pre-selects a
 * dropdown the user can change, so a wrong guess costs one tap.
 */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/bread|bakery|cafe|coffee|kopi|restaurant|food|kitchen|eat|mcdonald|starbucks|subway|toast/i, 'Food'],
  [/ntuc|fairprice|giant|cold storage|sheng siong|grocer|market|mart/i, 'Groceries'],
  [/grab|gojek|comfort|taxi|smrt|sbs|transit|bus|mrt|shell|esso|caltex/i, 'Transport'],
  [/singtel|starhub|m1|sp group|utilit|water|electric/i, 'Utilities'],
  [/netflix|spotify|cinema|golden village|cathay|steam|playstation|disney/i, 'Entertainment'],
  [/airline|singapore air|scoot|jetstar|hotel|airbnb|booking|agoda/i, 'Travel'],
  [/rent|landlord|hdb|property/i, 'Rent'],
];

/** Case and punctuation drift between alerts, so compare on a flattened form. */
export function normaliseMerchant(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A learned rule always beats a keyword guess. Longer rules are checked first
 * so a specific one ("HAPPY MEGA MART EXPRESS") wins over a general one
 * ("HAPPY MEGA MART") when both would match.
 */
export function resolveCategory(merchant: string, rules: MerchantRule[]): string {
  const norm = normaliseMerchant(merchant);

  const sorted = [...rules].sort((a, b) => b.merchant.length - a.merchant.length);
  for (const rule of sorted) {
    if (rule.merchant && norm.includes(rule.merchant)) return rule.category;
  }

  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(merchant)) return category;
  }
  return 'Other';
}