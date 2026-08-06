import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decimalsFor, parseAmount, toDecimalString, formatMoney } from './money';

describe('decimalsFor', () => {
  test('defaults to 2', () => {
    assert.equal(decimalsFor('EUR'), 2);
    assert.equal(decimalsFor('sgd'), 2);
  });

  test('knows zero- and three-decimal currencies', () => {
    assert.equal(decimalsFor('JPY'), 0);
    assert.equal(decimalsFor('KRW'), 0);
    assert.equal(decimalsFor('KWD'), 3);
  });
});

describe('parseAmount', () => {
  test('converts major units to minor units', () => {
    assert.equal(parseAmount('45', 'EUR'), 4500);
    assert.equal(parseAmount('45.5', 'EUR'), 4550);
    assert.equal(parseAmount('45.05', 'EUR'), 4505);
    assert.equal(parseAmount('1,234.56', 'EUR'), 123456);
  });

  test('respects currency exponent', () => {
    assert.equal(parseAmount('1200', 'JPY'), 1200);
    assert.equal(parseAmount('1.234', 'KWD'), 1234);
  });

  test('rejects too many decimals for the currency', () => {
    assert.throws(() => parseAmount('45.005', 'EUR'), /at most 2 decimal places/);
    assert.throws(() => parseAmount('1200.5', 'JPY'), /cannot have decimals/);
  });

  test('rejects junk and negatives', () => {
    for (const bad of ['', 'abc', '-5', '4.5.6', '5,', '1e3']) {
      assert.throws(() => parseAmount(bad, 'EUR'), /not a valid amount/, `accepted "${bad}"`);
    }
  });
});

describe('toDecimalString', () => {
  test('round-trips with parseAmount', () => {
    for (const value of ['0.00', '0.07', '45.00', '1234.56']) {
      assert.equal(toDecimalString(parseAmount(value, 'EUR'), 'EUR'), value);
    }
  });

  test('handles zero-decimal currencies and negatives', () => {
    assert.equal(toDecimalString(1200, 'JPY'), '1200');
    assert.equal(toDecimalString(-4505, 'EUR'), '-45.05');
  });
});

describe('formatMoney', () => {
  test('includes the amount and stays currency-aware', () => {
    const eur = formatMoney(4500, 'EUR', 'en-US');
    assert.match(eur, /45\.00/);
    assert.match(formatMoney(1200, 'JPY', 'en-US'), /1,200/);
  });

  test('falls back rather than throwing on an unknown code', () => {
    assert.equal(formatMoney(4500, 'XYZ123'), '45.00 XYZ123');
  });
});
