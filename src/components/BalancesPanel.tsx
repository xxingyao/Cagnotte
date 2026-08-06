'use client';

import { formatMoney } from '@/lib/money';
import type { Balance, Settlement } from '@/lib/balances';

export function BalancesPanel({
  balances,
  settlements,
  baseCurrency,
  nameOf,
  meSub,
}: {
  balances: Balance[];
  settlements: Settlement[];
  baseCurrency: string;
  nameOf: (userId: string) => string;
  meSub: string;
}) {
  const label = (userId: string) => (userId === meSub ? 'You' : nameOf(userId));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium">Balances</h2>

      <ul className="space-y-1.5">
        {balances.map((balance) => (
          <li key={balance.userId} className="flex items-center justify-between text-sm">
            <span>
              {label(balance.userId)}
              <span className="ml-2 text-xs text-slate-400">
                paid {formatMoney(balance.paid, baseCurrency)}
              </span>
            </span>
            <span
              className={
                balance.net > 0
                  ? 'font-medium text-emerald-600'
                  : balance.net < 0
                    ? 'font-medium text-red-600'
                    : 'text-slate-400'
              }
            >
              {balance.net > 0
                ? `is owed ${formatMoney(balance.net, baseCurrency)}`
                : balance.net < 0
                  ? `owes ${formatMoney(-balance.net, baseCurrency)}`
                  : 'settled up'}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 font-medium">Settle up</h3>
      {settlements.length === 0 ? (
        <p className="text-sm text-slate-500">Everyone&apos;s square. 🎉</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {settlements.map((settlement, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{label(settlement.from)}</span> pays{' '}
                <span className="font-medium">{label(settlement.to)}</span>{' '}
                {formatMoney(settlement.amount, baseCurrency)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            {settlements.length} {settlements.length === 1 ? 'payment' : 'payments'} clears the
            group. Settle outside the app — Cagnotte only keeps the record.
          </p>
        </>
      )}
    </section>
  );
}
