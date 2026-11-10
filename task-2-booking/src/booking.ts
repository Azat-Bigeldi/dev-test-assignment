// @rev kc-31
import { randomUUID } from 'node:crypto';
import type { Booking, Master, Service } from './types.ts';
import type { BookingRepo } from './store.ts';
import { getSlots } from './slots.ts';
import { createKeyedLock } from './lock.ts';
import { localToUtcMs, toMinutes, utcToLocal } from './time.ts';
import { normalizePhone } from './phone.ts';

export const CANCEL_MIN_LEAD_MS = 2 * 60 * 60 * 1000;

export class BookingError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type Deps = {
  masters: Master[];
  services: Service[];
  repo: BookingRepo;
  now: () => Date;
};

export function createBookingService({ masters, services, repo, now }: Deps) {
  const withMasterLock = createKeyedLock();

  function resolve(masterId: unknown, serviceId: unknown) {
    const master = masters.find((m) => m.id === masterId);
    if (!master) throw new BookingError(404, 'master_not_found');
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new BookingError(404, 'service_not_found');
    if (!service.masterIds.includes(master.id)) throw new BookingError(400, 'service_not_provided');
    return { master, service };
  }

  async function slots(masterId: string, serviceId: string, date: string): Promise<string[]> {
    const { master, service } = resolve(masterId, serviceId);
    const bookings = await repo.listByMaster(master.id);
    return getSlots(master, service, date, bookings, now());
  }

  async function create(input: unknown): Promise<Booking> {
    const body = (input ?? {}) as Record<string, unknown>;
    if (typeof body !== 'object' || Array.isArray(body)) throw new BookingError(400, 'invalid_body');

    const { masterId, serviceId, start, clientPhone } = body;
    if (typeof masterId !== 'string' || typeof serviceId !== 'string') throw new BookingError(400, 'invalid_body');
    if (typeof start !== 'string' || !ISO_WITH_TZ.test(start) || Number.isNaN(Date.parse(start))) {
      throw new BookingError(400, 'invalid_start');
    }
    const phone = normalizePhone(clientPhone);
    if (!phone) throw new BookingError(400, 'invalid_phone');

    const { master, service } = resolve(masterId, serviceId);
    const startMs = Date.parse(start);
    const local = utcToLocal(startMs);
    const exact = localToUtcMs(local.date, toMinutes(local.time)) === startMs;

    return withMasterLock(master.id, async () => {
      const bookings = await repo.listByMaster(master.id);
      const free = getSlots(master, service, local.date, bookings, now());
      if (!exact || !free.includes(local.time)) throw new BookingError(409, 'slot_unavailable');

      const booking: Booking = {
        id: `bk-${randomUUID()}`,
        masterId: master.id,
        serviceId: service.id,
        start: new Date(startMs).toISOString(),
        end: new Date(startMs + service.durationMin * 60_000).toISOString(),
        clientPhone: phone,
        status: 'active',
      };
      await repo.insert(booking);
      return booking;
    });
  }

  async function cancel(id: string): Promise<Booking> {
    const booking = await repo.get(id);
    if (!booking) throw new BookingError(404, 'booking_not_found');
    if (booking.status === 'cancelled') return booking;
    if (Date.parse(booking.start) - now().getTime() < CANCEL_MIN_LEAD_MS) {
      throw new BookingError(409, 'too_late');
    }
    await repo.update(id, { status: 'cancelled' });
    return { ...booking, status: 'cancelled' };
  }

  return { slots, create, cancel };
}
