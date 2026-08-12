import type { Expense, Member } from './types';

/**
 * How much an expense counts toward the group's base currency, or null if it
 * can't be counted — a different currency with no stored conversion, whether
 * that's an old expense from before this feature or a rate lookup that failed
 * at the moment it was logged.
 */

export function baseCurrencyAmount(expense: Expense, baseCurrency: string): number | null {
  if (expense.currency === baseCurrency) return expense.amountMinor;
  return expense.baseAmountMinor ?? null;
}
/**
 * Splits an amount into `count` whole minor units that sum back to exactly the
 * original.
 *
 * Naive division loses money: 1000 / 3 is 333 three times, which is 999. One
 * cent disappears per expense, balances stop summing to zero, and settling up
 * becomes unsolvable. The remainder is handed out one unit at a time to the
 * first few shares, so the order of `splitBetween` decides who absorbs it —
 * deterministic rather than arbitrary.
 */
export function splitEvenly(amountMinor: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(amountMinor / count);
  const remainder = amountMinor - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface Balance {
  memberId: string;
  name: string;
  /** Total this person paid out. */
  paidMinor: number;
  /** Total of this person's shares. */
  owedMinor: number;
  /** paid − owed. Positive: they're owed money. Negative: they owe. */
  netMinor: number;
}

/**
 * Who is up and who is down, for one currency.
 *
 * Expenses in other currencies are skipped rather than added in raw — without
 * exchange rates, mixing them would produce a confidently wrong number. The
 * caller is expected to say how many were left out.
 */
export function computeBalances(
  expenses: Expense[],
  members: Member[],
  currency: string,
): Balance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const member of members) {
    paid.set(member.id, 0);
    owed.set(member.id, 0);
  }

  for (const expense of expenses) {
    const baseAmount = baseCurrencyAmount(expense, currency);
    if (baseAmount === null) continue;

    if (!paid.has(expense.payerId)) continue;

    const sharers = expense.splitBetween.filter((id) => owed.has(id));
    if (sharers.length === 0) continue;

    paid.set(expense.payerId, paid.get(expense.payerId)! + baseAmount);

    const shares = splitEvenly(baseAmount, sharers.length);
    sharers.forEach((id, i) => owed.set(id, owed.get(id)! + shares[i]));
  }

  return members.map((member) => {
    const paidMinor = paid.get(member.id) ?? 0;
    const owedMinor = owed.get(member.id) ?? 0;
    return {
      memberId: member.id,
      name: member.name,
      paidMinor,
      owedMinor,
      netMinor: paidMinor - owedMinor,
    };
  });
}

export interface Settlement {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amountMinor: number;
}

/**
 * Who pays whom to clear the group.
 *
 * Greedy: repeatedly settle the largest debt against the largest credit. Finding
 * the provably fewest transfers is NP-hard, but this never needs more than one
 * transfer per person and matches what people work out on paper.
 */
export function computeSettlements(balances: Balance[]): Settlement[] {
  const debtors = balances
    .filter((b) => b.netMinor < 0)
    .map((b) => ({ ...b, remaining: -b.netMinor }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((b) => b.netMinor > 0)
    .map((b) => ({ ...b, remaining: b.netMinor }))
    .sort((a, b) => b.remaining - a.remaining);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amountMinor = Math.min(debtors[i].remaining, creditors[j].remaining);

    settlements.push({
      fromId: debtors[i].memberId,
      fromName: debtors[i].name,
      toId: creditors[j].memberId,
      toName: creditors[j].name,
      amountMinor,
    });

    debtors[i].remaining -= amountMinor;
    creditors[j].remaining -= amountMinor;
    if (debtors[i].remaining === 0) i++;
    if (creditors[j].remaining === 0) j++;
  }

  return settlements;
}