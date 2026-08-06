import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBalances,
  simplifyDebts,
  budgetProgress,
  monthOf,
  type Balance,
} from './balances';
import { splitEqual } from './splits';

/** Builds the expense + split rows an equally-split expense would produce. */
function expenseWithEqualSplit(
  id: string,
  payerId: string,
  amountInBase: number,
  memberIds: string[]
) {
  return {
    expense: { id, payerId, amountInBase },
    splits: splitEqual(amountInBase, memberIds).map((s) => ({
      expenseId: id,
      userId: s.userId,
      shareAmount: s.shareAmount,
    })),
  };
}

describe('computeBalances', () => {
  test('one payer, equal split, three members', () => {
    const members = ['ana', 'ben', 'chi'];
    const { expense, splits } = expenseWithEqualSplit('e1', 'ana', 3000, members);

    const balances = computeBalances({ expenses: [expense], splits, memberIds: members });
    const byUser = Object.fromEntries(balances.map((b) => [b.userId, b]));

    assert.equal(byUser.ana.net, 2000);
    assert.equal(byUser.ben.net, -1000);
    assert.equal(byUser.chi.net, -1000);
  });

  test('net balances always sum to zero', () => {
    const members = ['ana', 'ben', 'chi', 'dee'];
    const rows = [
      expenseWithEqualSplit('e1', 'ana', 5000, members),
      expenseWithEqualSplit('e2', 'ben', 1234, members),
      expenseWithEqualSplit('e3', 'chi', 99, members),
      expenseWithEqualSplit('e4', 'ana', 7, members),
    ];

    const balances = computeBalances({
      expenses: rows.map((r) => r.expense),
      splits: rows.flatMap((r) => r.splits),
      memberIds: members,
    });

    assert.equal(
      balances.reduce((sum, b) => sum + b.net, 0),
      0
    );
  });

  test('members with no activity appear at zero', () => {
    const balances = computeBalances({ expenses: [], splits: [], memberIds: ['ana', 'ben'] });
    assert.equal(balances.length, 2);
    assert.ok(balances.every((b) => b.net === 0 && b.paid === 0 && b.owed === 0));
  });

  test('ignores splits whose expense is gone', () => {
    const balances = computeBalances({
      expenses: [{ id: 'e1', payerId: 'ana', amountInBase: 1000 }],
      splits: [
        { expenseId: 'e1', userId: 'ana', shareAmount: 500 },
        { expenseId: 'e1', userId: 'ben', shareAmount: 500 },
        { expenseId: 'deleted', userId: 'ben', shareAmount: 9999 },
      ],
      memberIds: ['ana', 'ben'],
    });
    const ben = balances.find((b) => b.userId === 'ben')!;
    assert.equal(ben.owed, 500);
    assert.equal(ben.net, -500);
  });

  test('sorts creditors first', () => {
    const members = ['ana', 'ben'];
    const { expense, splits } = expenseWithEqualSplit('e1', 'ben', 1000, members);
    const balances = computeBalances({ expenses: [expense], splits, memberIds: members });
    assert.equal(balances[0].userId, 'ben');
  });
});

describe('simplifyDebts', () => {
  const balance = (userId: string, net: number): Balance => ({
    userId,
    paid: net > 0 ? net : 0,
    owed: net < 0 ? -net : 0,
    net,
  });

  test('one debtor, one creditor', () => {
    const settlements = simplifyDebts([balance('ana', 1000), balance('ben', -1000)]);
    assert.deepEqual(settlements, [{ from: 'ben', to: 'ana', amount: 1000 }]);
  });

  test('needs at most n-1 payments and clears every balance', () => {
    const balances = [
      balance('ana', 4500),
      balance('ben', -2000),
      balance('chi', -1500),
      balance('dee', -1000),
      balance('eli', 0),
    ];

    const settlements = simplifyDebts(balances);
    assert.ok(settlements.length <= balances.length - 1);

    const after = new Map(balances.map((b) => [b.userId, b.net]));
    for (const s of settlements) {
      after.set(s.from, after.get(s.from)! + s.amount);
      after.set(s.to, after.get(s.to)! - s.amount);
    }
    for (const [userId, net] of after) {
      assert.equal(net, 0, `${userId} not settled`);
    }
  });

  test('splits one debtor across two creditors', () => {
    const settlements = simplifyDebts([
      balance('ana', 600),
      balance('ben', 400),
      balance('chi', -1000),
    ]);
    assert.equal(settlements.length, 2);
    assert.ok(settlements.every((s) => s.from === 'chi'));
    assert.equal(
      settlements.reduce((sum, s) => sum + s.amount, 0),
      1000
    );
  });

  test('nobody pays anybody when everyone is square', () => {
    assert.deepEqual(simplifyDebts([balance('ana', 0), balance('ben', 0)]), []);
  });

  test('never emits a zero or negative payment', () => {
    const settlements = simplifyDebts([
      balance('ana', 1),
      balance('ben', 0),
      balance('chi', -1),
    ]);
    assert.ok(settlements.every((s) => s.amount > 0));
  });
});

describe('budgetProgress', () => {
  test('reports remaining and ratio', () => {
    const progress = budgetProgress(75_000, 100_000);
    assert.equal(progress.remaining, 25_000);
    assert.equal(progress.ratio, 0.75);
    assert.equal(progress.overspent, false);
    assert.equal(progress.nearingLimit, false);
  });

  test('flags 85% and overspend', () => {
    assert.equal(budgetProgress(85_000, 100_000).nearingLimit, true);
    const over = budgetProgress(120_000, 100_000);
    assert.equal(over.overspent, true);
    assert.equal(over.remaining, -20_000);
    assert.ok(over.ratio > 1, 'ratio should stay uncapped so overspend is visible');
  });

  test('does not divide by zero when no budget is set', () => {
    assert.equal(budgetProgress(5000, 0).ratio, 0);
  });
});

describe('monthOf', () => {
  test('buckets an ISO date into YYYY-MM', () => {
    assert.equal(monthOf('2026-03-14'), '2026-03');
  });
});
