/** Shapes stored in the browser. Same shapes will move to the database later. */

export interface Member {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  baseCurrency: string;
  inviteCode: string;
  members: Member[];
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  /** Integer minor units (cents). Never a float — see money.ts. */
  amountMinor: number;
  currency: string;
  category: string;
  payerId: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface Budget {
  groupId: string;
  /** YYYY-MM */
  month: string;
  limitMinor: number;
}

export interface AppData {
  version: 1;
  groups: Group[];
  expenses: Expense[];
  budgets: Budget[];
}