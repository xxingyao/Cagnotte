import { Fragment } from 'react';
import Link from 'next/link';
import { Avatars } from '@/components/Avatars';
import {
  activeGroup,
  balances,
  categories,
  currencies,
  expenses,
  members,
  settlements,
} from '@/lib/sample-data';

/** Static mock: every group id renders the same sample group. */
export default function GroupPage() {
  const meterClass =
    activeGroup.tone === 'over' ? 'is-over' : activeGroup.tone === 'warn' ? 'is-warn' : '';

  let lastDay = '';

  return (
    <main>
      <Link href="/" className="backlink">
        ← All groups
      </Link>
      <h1 className="page-title">{activeGroup.name}</h1>
      <p className="page-sub">
        {members.length} members · everything shown in {activeGroup.baseCurrency} ·{' '}
        <span className="chip chip-code">{activeGroup.inviteCode}</span>
      </p>

      <div className="stack">
        {/* Budget */}
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">{activeGroup.month}</h2>
            <span className="sub">{activeGroup.percent}% of budget</span>
          </div>
          <div className="amount-lg">{activeGroup.spent}</div>
          <div className="sub">spent this month of {activeGroup.limit}</div>
          <div className="meter">
            <div
              className={`meter-fill ${meterClass}`}
              style={{ width: `${Math.min(activeGroup.percent, 100)}%` }}
            />
          </div>
          <div className="budget-foot">
            <span>{activeGroup.remaining}</span>
            <span className="dim">9 days to go</span>
          </div>
        </section>

        {/* Add an expense — visual only */}
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Add an expense</h2>
          </div>
          <label className="field">
            <span className="field-label">What was it for?</span>
            <input className="input" placeholder="Dinner at the market" readOnly />
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Amount</span>
              <input className="input" placeholder="45.00" readOnly />
            </label>
            <label className="field">
              <span className="field-label">Currency</span>
              <select className="select" disabled defaultValue="EUR">
                {currencies.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Category</span>
              <select className="select" disabled defaultValue="Food">
                {categories.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Paid by</span>
              <select className="select" disabled defaultValue="You">
                {members.map((member) => (
                  <option key={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="split-hint">Split equally between all 4 members.</p>
          <span className="btn">Add expense</span>
        </section>

        {/* Balances */}
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Balances</h2>
          </div>
          <ul className="rows">
            {balances.map((balance) => (
              <li key={balance.id} className="row">
                <Avatars ids={[balance.id]} />
                <div className="row-main">
                  <div className="row-title">{balance.name}</div>
                  <div className="row-sub">{balance.paid}</div>
                </div>
                <div className="row-end">
                  <span className={`amount ${balance.tone}`}>{balance.standing}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Settle up */}
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Settle up</h2>
            <span className="sub">{settlements.length} payments clear the group</span>
          </div>
          {settlements.map((settlement) => (
            <div key={settlement.id} className="settle">
              <strong>{settlement.from}</strong>
              <span className="settle-arrow">pays</span>
              <strong>{settlement.to}</strong>
              <span className="row-end amount" style={{ marginLeft: 'auto' }}>
                {settlement.amount}
              </span>
            </div>
          ))}
          <p className="split-hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Settle outside the app — Cagnotte only keeps the record.
          </p>
        </section>

        {/* Expenses */}
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Expenses</h2>
          </div>
          {/* Day headings are siblings of the rows, not wrappers, so the
              separator rules land between rows rather than under a heading. */}
          <ul className="rows">
            {expenses.map((expense) => {
              const showDay = expense.day !== lastDay;
              lastDay = expense.day;
              return (
                <Fragment key={expense.id}>
                  {showDay && <li className="day-label">{expense.day}</li>}
                  <li className="row">
                    <span className="row-icon" aria-hidden="true">
                      {expense.icon}
                    </span>
                    <div className="row-main">
                      <div className="row-title">{expense.description}</div>
                      <div className="row-sub">{expense.payer}</div>
                    </div>
                    <div className="row-end">
                      <div className="amount">{expense.amount}</div>
                      {expense.converted && <div className="row-sub">{expense.converted}</div>}
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
