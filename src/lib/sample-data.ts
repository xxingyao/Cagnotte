/**
 * Sample content for the design mock.
 *
 * Amounts are pre-formatted strings on purpose — this is a static design pass,
 * so there is deliberately no money, FX or splitting logic anywhere yet. When
 * the real data layer arrives, this file goes away.
 */

export interface Member {
  id: string;
  name: string;
  initials: string;
  colour: string;
}

export const members: Member[] = [
  { id: 'you', name: 'You', initials: 'YO', colour: '#0e6b63' },
  { id: 'mei', name: 'Mei', initials: 'ME', colour: '#8a5a2b' },
  { id: 'tomas', name: 'Tomás', initials: 'TO', colour: '#3f5b8f' },
  { id: 'ana', name: 'Ana', initials: 'AN', colour: '#7a3f6d' },
];

export interface GroupSummary {
  id: string;
  name: string;
  baseCurrency: string;
  memberIds: string[];
  standing: string;
  standingTone: 'pos' | 'neg' | 'dim';
}

export const groups: GroupSummary[] = [
  {
    id: 'lisbon-flat',
    name: 'Lisbon flat',
    baseCurrency: 'EUR',
    memberIds: ['you', 'mei', 'tomas', 'ana'],
    standing: "you're owed €24.50",
    standingTone: 'pos',
  },
  {
    id: 'algarve-trip',
    name: 'Algarve trip',
    baseCurrency: 'EUR',
    memberIds: ['you', 'mei', 'tomas'],
    standing: 'you owe €68.00',
    standingTone: 'neg',
  },
  {
    id: 'seville-weekend',
    name: 'Seville weekend',
    baseCurrency: 'EUR',
    memberIds: ['you', 'ana'],
    standing: 'settled up',
    standingTone: 'dim',
  },
];

export const activeGroup = {
  id: 'lisbon-flat',
  name: 'Lisbon flat',
  baseCurrency: 'EUR',
  inviteCode: '7KQ4-B2XM',
  month: 'March 2026',
  spent: '€1,043.20',
  limit: '€1,200.00',
  remaining: '€156.80 left',
  percent: 87,
  tone: 'warn' as 'ok' | 'warn' | 'over',
};

export interface ExpenseRow {
  id: string;
  day: string;
  icon: string;
  description: string;
  payer: string;
  amount: string;
  converted?: string;
}

export const expenses: ExpenseRow[] = [
  {
    id: 'e1',
    day: 'Today',
    icon: '🍜',
    description: 'Dinner at the market',
    payer: 'Mei paid',
    amount: '€48.60',
  },
  {
    id: 'e2',
    day: 'Today',
    icon: '🚌',
    description: 'Metro top-ups',
    payer: 'You paid',
    amount: '€24.00',
  },
  {
    id: 'e3',
    day: 'Yesterday',
    icon: '🛒',
    description: 'Weekly groceries',
    payer: 'Tomás paid',
    amount: '€86.15',
  },
  {
    id: 'e4',
    day: 'Yesterday',
    icon: '🎟️',
    description: 'Fado tickets',
    payer: 'Ana paid',
    amount: '£54.00',
    converted: '≈ €63.40',
  },
  {
    id: 'e5',
    day: '1 March',
    icon: '🏠',
    description: 'Rent — March',
    payer: 'You paid',
    amount: '€820.00',
  },
];

export interface BalanceRow {
  id: string;
  name: string;
  paid: string;
  standing: string;
  tone: 'pos' | 'neg' | 'dim';
}

export const balances: BalanceRow[] = [
  { id: 'you', name: 'You', paid: 'paid €844.00', standing: 'is owed €24.50', tone: 'pos' },
  { id: 'tomas', name: 'Tomás', paid: 'paid €86.15', standing: 'is owed €12.30', tone: 'pos' },
  { id: 'mei', name: 'Mei', paid: 'paid €48.60', standing: 'owes €18.90', tone: 'neg' },
  { id: 'ana', name: 'Ana', paid: 'paid €63.40', standing: 'owes €17.90', tone: 'neg' },
];

export const settlements = [
  { id: 's1', from: 'Mei', to: 'You', amount: '€18.90' },
  { id: 's2', from: 'Ana', to: 'You', amount: '€5.60' },
  { id: 's3', from: 'Ana', to: 'Tomás', amount: '€12.30' },
];

export const categories = [
  'Food',
  'Groceries',
  'Rent',
  'Transport',
  'Utilities',
  'Entertainment',
  'Travel',
  'Other',
];

export const currencies = ['EUR', 'GBP', 'USD', 'SGD', 'JPY', 'AUD', 'CHF', 'BRL'];
