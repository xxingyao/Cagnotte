/**
 * Balances and settlement — the "who owes whom" half of the app.
 *
 * Pure functions over plain data so they can be unit-tested without AWS, and so
 * the same code can later move into a Lambda unchanged if the group data grows
 * past what is sensible to send to the client.
 */

export interface BalanceInput {
  /** Every expense in scope, with who fronted the money (base-currency minor units). */
  expenses: Array<{ id: string; payerId: string; amountInBase: number }>;
  /** Every split row for those expenses (base-currency minor units). */
  splits: Array<{ expenseId: string; userId: string; shareAmount: number }>;
  /** Group members, so people who owe nothing still appear at zero. */
  memberIds: string[];
}

export interface Balance {
  userId: string;
  /** What this member fronted. */
  paid: number;
  /** What this member's share of the group's spending came to. */
  owed: number;
  /** paid - owed. Positive = the group owes them; negative = they owe the group. */
  net: number;
}

export interface Settlement {
  from: string;
  to: string;
  /** Minor units, base currency. Always positive. */
  amount: number;
}

/** Per-member paid / owed / net, in the group's base currency. */
export function computeBalances({ expenses, splits, memberIds }: BalanceInput): Balance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const userId of memberIds) {
    paid.set(userId, 0);
    owed.set(userId, 0);
  }

  const known = new Set(expenses.map((e) => e.id));

  for (const expense of expenses) {
    paid.set(expense.payerId, (paid.get(expense.payerId) ?? 0) + expense.amountInBase);
  }
  for (const split of splits) {
    // Splits can outlive their expense for a moment after a delete; counting
    // them would leave a phantom debt on someone's balance.
    if (!known.has(split.expenseId)) continue;
    owed.set(split.userId, (owed.get(split.userId) ?? 0) + split.shareAmount);
  }

  const userIds = new Set([...paid.keys(), ...owed.keys()]);
  return [...userIds]
    .map((userId) => {
      const p = paid.get(userId) ?? 0;
      const o = owed.get(userId) ?? 0;
      return { userId, paid: p, owed: o, net: p - o };
    })
    .sort((a, b) => b.net - a.net || a.userId.localeCompare(b.userId));
}

/**
 * The classic greedy minimum-cash-flow pass: repeatedly settle the largest
 * debtor against the largest creditor. Each step zeroes at least one person, so
 * a group of n settles in at most n-1 payments instead of everyone paying
 * everyone.
 *
 * Greedy is not guaranteed optimal in the general case (that problem is
 * NP-hard), but it is optimal for the common shapes and never worse than n-1.
 */
export function simplifyDebts(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ userId: b.userId, amount: b.net }));
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ userId: b.userId, amount: -b.net }));

  creditors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
  debtors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

  const settlements: Settlement[] = [];
  let c = 0;
  let d = 0;

  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].amount, debtors[d].amount);
    if (amount > 0) {
      settlements.push({ from: debtors[d].userId, to: creditors[c].userId, amount });
    }
    creditors[c].amount -= amount;
    debtors[d].amount -= amount;
    if (creditors[c].amount === 0) c += 1;
    if (debtors[d].amount === 0) d += 1;
  }

  return settlements;
}

/** `YYYY-MM` for a date, used to bucket expenses against a monthly budget. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export interface BudgetProgress {
  spent: number;
  limit: number;
  /** 0-1+, uncapped so overspend is visible. */
  ratio: number;
  remaining: number;
  overspent: boolean;
  /** True past 85% — the threshold the plan's "you've used 85%" alert uses. */
  nearingLimit: boolean;
}

export function budgetProgress(spentInBase: number, limitInBase: number): BudgetProgress {
  const ratio = limitInBase > 0 ? spentInBase / limitInBase : 0;
  return {
    spent: spentInBase,
    limit: limitInBase,
    ratio,
    remaining: limitInBase - spentInBase,
    overspent: spentInBase > limitInBase,
    nearingLimit: ratio >= 0.85,
  };
}
