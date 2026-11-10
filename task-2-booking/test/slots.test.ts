// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlots } from '../src/slots.ts';
import { isValidDate, overlaps, toMinutes } from '../src/time.ts';
import type { Booking, Master, Service } from '../src/types.ts';

const day = { from: '10:00', to: '13:00', breaks: [] };

const master: Master = {
  id: 'm-1',
  name: 'Тест',
  schedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: null, sun: null },
};

const cut: Service = { id: 's-cut', name: 'Стрижка', durationMin: 60, masterIds: ['m-1'] };

const range = (from: string, to: string) => ({ start: toMinutes(from), end: toMinutes(to) });

const PAST = new Date('2030-01-01T00:00:00Z');

const booking = (start: string, end: string, status: Booking['status'] = 'active', masterId = 'm-1'): Booking => ({
  id: `bk-${start}`,
  masterId,
  serviceId: 's-cut',
  start,
  end,
  clientPhone: '+77012345678',
  status,
});

test('overlaps: пересекающиеся интервалы', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('10:30', '11:30')), true);
});

test('overlaps: запись сразу после другой не пересекается', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('11:00', '12:00')), false);
});

test('overlaps: вложенный интервал пересекается', () => {
  assert.equal(overlaps(range('10:00', '12:00'), range('10:30', '11:00')), true);
});

test('getSlots: свободный день', () => {
  // 2030-11-18 — понедельник
  const slots = getSlots(master, cut, '2030-11-18', [], PAST);
  assert.deepEqual(slots, ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00']);
});

test('getSlots: выходной', () => {
  assert.deepEqual(getSlots(master, cut, '2030-11-23', [], PAST), []);
});

test('getSlots: слот не пересекает перерыв', () => {
  const withBreak: Master = {
    ...master,
    schedule: { ...master.schedule, mon: { from: '10:00', to: '13:00', breaks: [{ from: '11:30', to: '12:00' }] } },
  };
  assert.deepEqual(getSlots(withBreak, cut, '2030-11-18', [], PAST), ['10:00', '10:15', '10:30', '12:00']);
});

test('getSlots: занятое время не выдаётся, отменённые записи не мешают', () => {
  const bookings = [
    booking('2030-11-18T06:00:00.000Z', '2030-11-18T07:00:00.000Z'),
    booking('2030-11-18T05:00:00.000Z', '2030-11-18T06:00:00.000Z', 'cancelled'),
    booking('2030-11-18T07:00:00.000Z', '2030-11-18T08:00:00.000Z', 'active', 'm-2'),
  ];
  assert.deepEqual(getSlots(master, cut, '2030-11-18', bookings, PAST), ['10:00', '12:00']);
});

test('getSlots: прошедшее время не выдаётся', () => {
  const now = new Date('2030-11-18T05:20:00Z');
  assert.deepEqual(getSlots(master, cut, '2030-11-18', [], now), [
    '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00',
  ]);
});

test('getSlots: слот, начинающийся ровно сейчас, не выдаётся', () => {
  const now = new Date('2030-11-18T05:00:00Z');
  assert.equal(getSlots(master, cut, '2030-11-18', [], now)[0], '10:15');
});

test('getSlots: прошедший день пуст', () => {
  assert.deepEqual(getSlots(master, cut, '2030-11-18', [], new Date('2030-11-19T00:00:00Z')), []);
});

test('getSlots: день определяется по Алматы, а не по UTC', () => {
  const slots = getSlots(master, cut, '2030-11-18', [], new Date('2030-11-17T23:00:00Z'));
  assert.equal(slots.length, 9);
});

test('isValidDate', () => {
  assert.equal(isValidDate('2030-11-18'), true);
  assert.equal(isValidDate('2030-02-30'), false);
  assert.equal(isValidDate('2030-1-5'), false);
  assert.equal(isValidDate('завтра'), false);
});
