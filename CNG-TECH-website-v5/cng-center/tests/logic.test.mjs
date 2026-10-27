import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, parseNumber, calculateSavings, eligibilityMessage } from '../public/assets/logic.js';
const base = { distance: 2000, petrolConsumption: 8, gasConsumption: 8.5, petrolPrice: 3000, gasPrice: 1000, gasShare: 70 };
test('Persian, Arabic and Latin digits', () => {
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'), '01234567890123456789');
  assert.equal(parseNumber(' ۲٬۰۰۰ '), 2000);
  assert.equal(parseNumber('٨٫٥'), 8.5);
  assert.equal(parseNumber('1,234.5'), 1234.5);
});
test('invalid numeric input', () => { for (const value of ['', ' ', '-2', '1e3', 'Infinity', '<script>', '۲ تومان', '۱٫۲٫۳']) assert.ok(Number.isNaN(parseNumber(value))); });
test('known monthly and yearly calculation', () => {
  const value = calculateSavings(base);
  assert.equal(value.petrolOnly, 480000);
  assert.ok(Math.abs(value.mixed - 263000) < 1e-8);
  assert.ok(Math.abs(value.monthly - 217000) < 1e-8);
  assert.ok(Math.abs(value.annual - 2604000) < 1e-8);
});
test('zero/full gas share and negative savings', () => {
  assert.equal(calculateSavings({ ...base, gasShare: 0 }).monthly, 0);
  assert.equal(calculateSavings({ ...base, gasShare: 100 }).mixed, 170000);
  assert.ok(calculateSavings({ ...base, gasPrice: 10000 }).monthly < 0);
});
test('numeric ranges and nonfinite values', () => {
  for (const [key, value] of [['distance', 0], ['distance', 100001], ['gasShare', -1], ['gasShare', 101], ['gasConsumption', 0], ['petrolConsumption', 101], ['petrolPrice', 0], ['gasPrice', 10000001], ['distance', Infinity], ['distance', NaN], ['gasShare', '70']]) assert.throws(() => calculateSavings({ ...base, [key]: value }), RangeError);
});
test('private model year boundaries, with conditional messaging', () => {
  assert.match(eligibilityMessage('private', 1394, 1394, 1406).text, /هم‌خوان/);
  assert.match(eligibilityMessage('private', 1393, 1394, 1406).text, /پایین‌تر/);
  assert.match(eligibilityMessage('private', 1400, 1394, 1406).text, /تأیید مشمول بودن نیست/);
  for (const year of [1299, 1407, NaN, 1394.5]) assert.equal(eligibilityMessage('private', year, 1394, 1406).error, true);
});
test('public and online vehicles are not decided by private model year', () => {
  for (const type of ['public', 'online']) assert.equal(eligibilityMessage(type, NaN, 1394, 1406).error, false);
  assert.equal(eligibilityMessage('invalid', 1399, 1394, 1406).error, true);
});
