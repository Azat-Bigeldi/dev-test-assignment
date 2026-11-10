// @rev kc-31
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHandler } from '../src/app.ts';
import { createBookingRepo, loadBookings, masters, services } from '../src/store.ts';

async function start(t: TestContext, nowIso = '2030-11-17T07:00:00Z') {
  let current = new Date(nowIso);
  const repo = createBookingRepo(loadBookings());
  const server = createServer(createHandler({ masters, services, repo, now: () => current }));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  return {
    setNow: (iso: string) => (current = new Date(iso)),
    slots: (master: string, query: string) => call('GET', `/masters/${master}/slots?${query}`),
    book: (body: unknown) => call('POST', '/bookings', body),
    cancel: (id: string) => call('DELETE', `/bookings/${id}`),
  };
}

const request = (start: string, extra: Record<string, unknown> = {}) => ({
  masterId: 'm-1',
  serviceId: 's-cut',
  start,
  clientPhone: '8 (701) 234-56-78',
  ...extra,
});

test('GET slots: учитывает записи, перерыв и отменённые записи', async (t) => {
  const api = await start(t);
  const res = await api.slots('m-1', 'serviceId=s-cut&date=2030-11-18');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    masterId: 'm-1',
    serviceId: 's-cut',
    date: '2030-11-18',
    slots: [
      '11:00', '11:15', '11:30', '13:00',
      '15:00', '15:15', '15:30', '15:45', '16:00', '16:15', '16:30', '16:45',
      '17:00', '17:15', '17:30', '17:45', '18:00',
    ],
  });
});

test('GET slots: ошибки валидации — 400', async (t) => {
  const api = await start(t);
  for (const query of ['date=2030-11-18', 'serviceId=s-cut', 'serviceId=s-cut&date=2030-02-30', 'serviceId=s-cut&date=18.11.2030']) {
    assert.equal((await api.slots('m-1', query)).status, 400, query);
  }
  const res = await api.slots('m-1', 'serviceId=s-mani&date=2030-11-18');
  assert.equal(res.status, 400);
});

test('GET slots: нет мастера или услуги — 404', async (t) => {
  const api = await start(t);
  assert.equal((await api.slots('m-404', 'serviceId=s-cut&date=2030-11-18')).status, 404);
  assert.equal((await api.slots('m-1', 'serviceId=s-404&date=2030-11-18')).status, 404);
});

test('POST /bookings: создаёт запись, время в UTC, телефон нормализован', async (t) => {
  const api = await start(t);
  const res = await api.book(request('2030-11-18T15:00:00+05:00'));
  assert.equal(res.status, 201);
  assert.match(res.body.id, /^bk-/);
  assert.deepEqual({ ...res.body, id: undefined }, {
    id: undefined,
    masterId: 'm-1',
    serviceId: 's-cut',
    start: '2030-11-18T10:00:00.000Z',
    end: '2030-11-18T11:00:00.000Z',
    clientPhone: '+77012345678',
    status: 'active',
  });

  const slots = await api.slots('m-1', 'serviceId=s-cut&date=2030-11-18');
  assert.ok(!slots.body.slots.includes('15:00'));
  assert.ok(!slots.body.slots.includes('14:45') && !slots.body.slots.includes('15:45'));
  assert.ok(slots.body.slots.includes('16:00'));
});

test('POST /bookings: start в любом часовом поясе', async (t) => {
  const api = await start(t);
  const res = await api.book(request('2030-11-18T10:00:00Z'));
  assert.equal(res.status, 201);
  assert.equal(res.body.start, '2030-11-18T10:00:00.000Z');
});

test('POST /bookings: время не из свободных слотов — 409', async (t) => {
  const api = await start(t);
  for (const startAt of [
    '2030-11-18T10:00:00+05:00',
    '2030-11-18T14:00:00+05:00',
    '2030-11-18T15:10:00+05:00',
    '2030-11-18T15:00:30+05:00',
    '2030-11-18T18:15:00+05:00',
    '2030-11-24T12:00:00+05:00',
    '2030-11-17T11:00:00+05:00',
  ]) {
    const res = await api.book(request(startAt));
    assert.equal(res.status, 409, startAt);
    assert.deepEqual(res.body, { error: 'slot_unavailable' });
  }
});

test('POST /bookings: время, освобождённое отменой, можно занять', async (t) => {
  const api = await start(t);
  assert.equal((await api.book(request('2030-11-18T16:00:00+05:00'))).status, 201);
});

test('POST /bookings: некорректные данные — 400', async (t) => {
  const api = await start(t);
  const cases: unknown[] = [
    request('2030-11-18T15:00:00+05:00', { clientPhone: '+7 727 123 45 67' }),
    request('2030-11-18T15:00:00+05:00', { clientPhone: undefined }),
    request('2030-11-18T15:00:00'),
    request('завтра в три'),
    request('2030-11-18T15:00:00+05:00', { masterId: undefined }),
    request('2030-11-18T15:00:00+05:00', { serviceId: 's-mani' }),
    '{"masterId":',
    null,
  ];
  for (const body of cases) {
    const res = await api.book(body === null ? '' : body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('POST /bookings: нет мастера или услуги — 404', async (t) => {
  const api = await start(t);
  assert.equal((await api.book(request('2030-11-18T15:00:00+05:00', { masterId: 'm-404' }))).status, 404);
  assert.equal((await api.book(request('2030-11-18T15:00:00+05:00', { serviceId: 's-404' }))).status, 404);
});

test('POST /bookings: одновременные запросы на одно время — создаётся одна запись', async (t) => {
  const api = await start(t);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      api.book(request('2030-11-18T15:00:00+05:00', { clientPhone: `8 701 000 00 ${String(i).padStart(2, '0')}` })),
    ),
  );
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, ...Array(9).fill(409)]);
});

test('POST /bookings: одновременные пересекающиеся записи разных услуг — создаётся одна', async (t) => {
  const api = await start(t);
  const [a, b] = await Promise.all([
    api.book(request('2030-11-18T15:00:00+05:00')),
    api.book(request('2030-11-18T15:30:00+05:00', { serviceId: 's-brows' })),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
});

test('POST /bookings: одновременные записи на разное время проходят обе', async (t) => {
  const api = await start(t);
  const [a, b] = await Promise.all([
    api.book(request('2030-11-18T15:00:00+05:00')),
    api.book(request('2030-11-18T16:00:00+05:00')),
  ]);
  assert.deepEqual([a.status, b.status], [201, 201]);
});

test('DELETE /bookings/:id: отменяет запись и освобождает время', async (t) => {
  const api = await start(t);
  const res = await api.cancel('bk-1');
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'bk-1');
  assert.equal(res.body.status, 'cancelled');

  const slots = await api.slots('m-1', 'serviceId=s-cut&date=2030-11-18');
  assert.equal(slots.body.slots[0], '10:00');
});

test('DELETE /bookings/:id: повторная отмена — 200', async (t) => {
  const api = await start(t);
  await api.cancel('bk-1');
  const res = await api.cancel('bk-1');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'cancelled');
  api.setNow('2030-11-18T16:30:00Z');
  assert.equal((await api.cancel('bk-3')).status, 200);
});

test('DELETE /bookings/:id: меньше чем за 2 часа — 409 too_late', async (t) => {
  const api = await start(t);
  api.setNow('2030-11-18T03:00:01Z');
  const res = await api.cancel('bk-1');
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'too_late' });

  api.setNow('2030-11-18T06:00:00Z');
  assert.equal((await api.cancel('bk-1')).status, 409);
});

test('DELETE /bookings/:id: ровно за 2 часа — можно', async (t) => {
  const api = await start(t, '2030-11-18T03:00:00Z');
  assert.equal((await api.cancel('bk-1')).status, 200);
});

test('DELETE /bookings/:id: нет записи — 404', async (t) => {
  const api = await start(t);
  assert.equal((await api.cancel('bk-404')).status, 404);
});
