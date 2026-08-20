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
  /** Member ids sharing this cost. At least one; usually everyone. */
  splitBetween: string[];
  /** YYYY-MM-DD */
  date: string;
  /** Converted to the group's base currency, frozen at the moment this was
   *  logged. Null if the currency already matched, or the rate lookup failed
   *  and this expense isn't counted toward totals yet. */
  baseAmountMinor: number | null;
  /** The rate used for that conversion. Null alongside baseAmountMinor. */
  rate: number | null;
}

export interface Budget {
  groupId: string;
  /** YYYY-MM */
  month: string;
  limitMinor: number;
}

export interface Friend {
  friendId: string;
  friendEmail: string;
  friendName: string;
  status: 'pending' | 'sent' | 'accepted';
  createdAt: number;
}

export interface AppData {
  version: 1;
  groups: Group[];
  expenses: Expense[];
  budgets: Budget[];
}
