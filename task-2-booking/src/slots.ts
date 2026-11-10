// @rev kc-31
import type { Booking, Master, Service } from './types.ts';
import { fromMinutes, localToUtcMs, overlaps, toMinutes, weekday, type Range } from './time.ts';

export const SLOT_STEP_MIN = 15;

export function getSlots(
  master: Master,
  service: Service,
  date: string,
  bookings: Booking[],
  now: Date,
): string[] {
  const day = master.schedule[weekday(date)];
  if (!day) return [];

  const breaks: Range[] = day.breaks.map((b) => ({ start: toMinutes(b.from), end: toMinutes(b.to) }));
  const busy: Range[] = bookings
    .filter((b) => b.masterId === master.id && b.status === 'active')
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const nowMs = now.getTime();

  const result: string[] = [];
  const end = toMinutes(day.to);
  for (let t = toMinutes(day.from); t + service.durationMin <= end; t += SLOT_STEP_MIN) {
    const local: Range = { start: t, end: t + service.durationMin };
    if (breaks.some((b) => overlaps(local, b))) continue;

    const abs: Range = { start: localToUtcMs(date, local.start), end: localToUtcMs(date, local.end) };
    if (abs.start <= nowMs) continue;
    if (busy.some((b) => overlaps(abs, b))) continue;

    result.push(fromMinutes(t));
  }
  return result;
}
