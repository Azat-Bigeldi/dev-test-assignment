// @rev kc-31
import { createServer } from 'node:http';
import { bookingRepo, masters, services } from './store.ts';
import { createHandler } from './app.ts';

const port = Number(process.env.PORT ?? 3002);

createServer(createHandler({ masters, services, repo: bookingRepo })).listen(port, () => {
  console.log(`booking: http://localhost:${port}`);
});
