'use client';

import { formatMoney } from '@/lib/money';
import { CATEGORY_EMOJI, categoryLabel } from '@/lib/currencies';
import type { Schema } from '../../amplify/data/resource';

type Expense = Schema['Expense']['type'];

export function ExpenseList({
  expenses,
  baseCurrency,
  nameOf,
}: {
  expenses: Expense[];
  baseCurrency: string;
  nameOf: (userId: string) => string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium">Expenses</h2>

      {expenses.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {expenses.map((expense) => {
            const converted = expense.currencyOriginal !== baseCurrency;
            return (
              <li key={expense.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="mr-1.5">{CATEGORY_EMOJI[expense.category ?? 'OTHER']}</span>
                    {expense.description}
                  </p>
                  <p className="text-xs text-slate-500">
                    {expense.date} · {nameOf(expense.payerId)} paid ·{' '}
                    {categoryLabel(expense.category)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium">
                    {formatMoney(expense.amountOriginal, expense.currencyOriginal)}
                  </p>
                  {converted && (
                    // Both figures stay visible: the original is what was
                    // actually paid, the converted one is what the group counts.
                    <p className="text-xs text-slate-500">
                      ≈ {formatMoney(expense.amountInBase, baseCurrency)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
