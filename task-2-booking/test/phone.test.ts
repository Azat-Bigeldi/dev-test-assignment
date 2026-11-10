// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.ts';

test('normalizePhone: допустимые форматы', () => {
  for (const input of [
    '+7 701 234 56 78',
    '87012345678',
    '8 (701) 234-56-78',
    '+7(701)234-56-78',
    '+77012345678',
    '77012345678',
    '  8 701 234 5678 ',
  ]) {
    assert.equal(normalizePhone(input), '+77012345678', input);
  }
});

test('normalizePhone: другие операторы', () => {
  assert.equal(normalizePhone('8 747 111 22 33'), '+77471112233');
  assert.equal(normalizePhone('8 778 111 22 33'), '+77781112233');
});

test('normalizePhone: недопустимые номера', () => {
  for (const input of [
    '',
    '7012345678',
    '+8 701 234 56 78',
    '8701234567',
    '870123456789',
    '+7 727 123 45 67',
    '+7 916 123 45 67',
    '+7 701 abc 56 78',
    '+7 701 234 56 78 доб. 1',
    '8-701-234-56-78+',
  ]) {
    assert.equal(normalizePhone(input), null, input);
  }
  assert.equal(normalizePhone(87012345678), null);
  assert.equal(normalizePhone(undefined), null);
});
