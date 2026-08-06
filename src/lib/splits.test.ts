import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual, splitByWeights, splitExact } from './splits';

const sum = (shares: Array<{ shareAmount: number }>) =>
  shares.reduce((acc, s) => acc + s.shareAmount, 0);

describe('splitEqual', () => {
  test('divides evenly when it divides evenly', () => {
    const shares = splitEqual(3000, ['a', 'b', 'c']);
    assert.deepEqual(
      shares.map((s) => s.shareAmount),
      [1000, 1000, 1000]
    );
  });

  test('never loses a minor unit to rounding', () => {
    const shares = splitEqual(1000, ['a', 'b', 'c']);
    assert.equal(sum(shares), 1000);
    assert.deepEqual(shares.map((s) => s.shareAmount).sort(), [333, 333, 334]);
  });

  test('sums to the total for every group size and awkward amount', () => {
    for (let members = 1; members <= 15; members++) {
      for (const total of [1, 7, 99, 1000, 12345, 999999]) {
        const ids = Array.from({ length: members }, (_, i) => `u${i}`);
        const shares = splitEqual(total, ids);
        assert.equal(sum(shares), total, `${total} across ${members}`);
        const values = shares.map((s) => s.shareAmount);
        assert.ok(
          Math.max(...values) - Math.min(...values) <= 1,
          `shares differ by more than one minor unit: ${values}`
        );
      }
    }
  });

  test('preserves member order', () => {
    const shares = splitEqual(100, ['zoe', 'adam', 'mei']);
    assert.deepEqual(
      shares.map((s) => s.userId),
      ['zoe', 'adam', 'mei']
    );
  });

  test('rejects an empty group', () => {
    assert.throws(() => splitEqual(1000, []), /at least one participant/);
  });
});

describe('splitByWeights', () => {
  test('splits by shares', () => {
    const shares = splitByWeights(4000, [
      { userId: 'a', weight: 3 },
      { userId: 'b', weight: 1 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.shareAmount),
      [3000, 1000]
    );
  });

  test('splits by percentage and still sums exactly', () => {
    const shares = splitByWeights(10000, [
      { userId: 'a', weight: 33.33 },
      { userId: 'b', weight: 33.33 },
      { userId: 'c', weight: 33.34 },
    ]);
    assert.equal(sum(shares), 10000);
  });

  test('gives leftovers to the largest fractional remainder', () => {
    // 100 across weights 1/1/1 -> 33.33 each; the extra unit goes to the first.
    const shares = splitByWeights(100, [
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 1 },
      { userId: 'c', weight: 1 },
    ]);
    assert.equal(sum(shares), 100);
    assert.equal(shares[0].shareAmount, 34);
  });

  test('allows a zero weight (member excluded from this expense)', () => {
    const shares = splitByWeights(1000, [
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 0 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.shareAmount),
      [1000, 0]
    );
  });

  test('rejects negative and all-zero weights', () => {
    assert.throws(
      () => splitByWeights(100, [{ userId: 'a', weight: -1 }]),
      /cannot be negative/
    );
    assert.throws(
      () => splitByWeights(100, [{ userId: 'a', weight: 0 }]),
      /more than zero/
    );
  });

  test('rejects fractional totals — money must be whole minor units', () => {
    assert.throws(
      () => splitByWeights(10.5, [{ userId: 'a', weight: 1 }]),
      /whole minor units/
    );
  });
});

describe('splitExact', () => {
  test('accepts amounts that sum to the total', () => {
    const shares = [
      { userId: 'a', shareAmount: 700 },
      { userId: 'b', shareAmount: 300 },
    ];
    assert.deepEqual(splitExact(1000, shares), shares);
  });

  test('rejects amounts that do not', () => {
    assert.throws(
      () => splitExact(1000, [{ userId: 'a', shareAmount: 999 }]),
      /add up to 999 but the expense is 1000/
    );
  });
});
