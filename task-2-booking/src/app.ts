// @rev kc-31
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Master, Service } from './types.ts';
import type { BookingRepo } from './store.ts';
import { BookingError, createBookingService } from './booking.ts';
import { isValidDate } from './time.ts';
import { now as clockNow } from './clock.ts';

type Deps = {
  masters: Master[];
  services: Service[];
  repo: BookingRepo;
  now?: () => Date;
};

export function createHandler({ masters, services, repo, now = clockNow }: Deps) {
  const bookings = createBookingService({ masters, services, repo, now });

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url.pathname === '/masters') {
        return send(res, 200, masters);
      }

      if (req.method === 'GET' && url.pathname === '/services') {
        return send(res, 200, services);
      }

      if (req.method === 'GET' && parts[0] === 'masters' && parts[2] === 'slots' && parts.length === 3) {
        const serviceId = url.searchParams.get('serviceId');
        const date = url.searchParams.get('date');
        if (!serviceId || !date) return send(res, 400, { error: 'missing_params' });
        if (!isValidDate(date)) return send(res, 400, { error: 'invalid_date' });
        const slots = await bookings.slots(parts[1], serviceId, date);
        return send(res, 200, { masterId: parts[1], serviceId, date, slots });
      }

      if (req.method === 'POST' && url.pathname === '/bookings') {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          return send(res, 400, { error: 'invalid_json' });
        }
        return send(res, 201, await bookings.create(body));
      }

      if (req.method === 'DELETE' && parts[0] === 'bookings' && parts.length === 2) {
        return send(res, 200, await bookings.cancel(parts[1]));
      }

      send(res, 404, { error: 'not_found' });
    } catch (err) {
      if (err instanceof BookingError) return send(res, err.status, { error: err.code });
      console.error(err);
      send(res, 500, { error: 'internal' });
    }
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
