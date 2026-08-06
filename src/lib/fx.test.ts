import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convert, toRateTable, ratesAgeInHours } from './fx';

// USD -> quote, the shape the fx-refresh Lambda caches.
const rates = { USD: 1, EUR: 0.92, SGD: 1.35, JPY: 150 };

describe('convert', () => {
  test('is a no-op for the same currency', () => {
    const result = convert(4500, 'EUR', 'EUR', rates);
    assert.equal(result.amountInBase, 4500);
    assert.equal(result.fxRateUsed, 1);
  });

  test('converts through USD', () => {
    // €45.00 at 1.35 SGD/USD ÷ 0.92 EUR/USD ≈ S$66.03
    const result = convert(4500, 'EUR', 'SGD', rates);
    assert.equal(result.amountInBase, 6603);
    assert.ok(Math.abs(result.fxRateUsed - 1.35 / 0.92) < 1e-9);
  });

  test('handles a zero-decimal source currency', () => {
    // ¥15,000 at 150 JPY/USD = $100.00
    assert.equal(convert(15000, 'JPY', 'USD', rates).amountInBase, 10000);
  });

  test('handles a zero-decimal target currency', () => {
    // $100.00 = ¥15,000, with no phantom minor units
    assert.equal(convert(10000, 'USD', 'JPY', rates).amountInBase, 15000);
  });

  test('round-trips within a minor unit', () => {
    const there = convert(4500, 'EUR', 'SGD', rates);
    const back = convert(there.amountInBase, 'SGD', 'EUR', rates);
    assert.ok(Math.abs(back.amountInBase - 4500) <= 1);
  });

  test('is case-insensitive about currency codes', () => {
    assert.equal(convert(4500, 'eur', 'sgd', rates).amountInBase, 6603);
  });

  test('refuses to guess when a rate is missing', () => {
    assert.throws(() => convert(1000, 'XXX', 'SGD', rates), /No cached exchange rate for XXX/);
    assert.throws(() => convert(1000, 'EUR', 'XXX', rates), /No cached exchange rate for XXX/);
  });
});

describe('toRateTable', () => {
  test('keeps USD-based rows and always includes USD itself', () => {
    const table = toRateTable([
      { base: 'USD', quote: 'EUR', rate: 0.92 },
      { base: 'USD', quote: 'SGD', rate: 1.35 },
      { base: 'EUR', quote: 'GBP', rate: 0.85 },
    ]);
    assert.deepEqual(table, { EUR: 0.92, SGD: 1.35, USD: 1 });
  });
});

describe('ratesAgeInHours', () => {
  test('measures staleness', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const age = ratesAgeInHours(threeHoursAgo)!;
    assert.ok(Math.abs(age - 3) < 0.1);
  });

  test('returns null for missing or unparseable timestamps', () => {
    assert.equal(ratesAgeInHours(null), null);
    assert.equal(ratesAgeInHours('not a date'), null);
  });
});
