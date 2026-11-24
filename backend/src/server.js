import 'dotenv/config';
import Fastify from 'fastify';
import { Pool } from 'pg';
import { registerLocalRoutes } from './localAuth.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '4000');
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error('This starter is local-only; HOST must be 127.0.0.1 or localhost.');
}
if (!process.env.DATABASE_URL) throw new Error('Copy .env.example to .env and set DATABASE_URL.');
const dbUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || dbUrl.pathname !== '/little_genius_dev') {
  throw new Error('LOCAL ONLY: use a localhost PostgreSQL database named little_genius_dev.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });
pool.on('error', error => console.error('Idle database connection error:', error.message));
const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });
app.get('/api/health', async () => ({ ok: true, service: 'little-genius-local-api', mode: 'development' }));
app.get('/api/health/db', async (_request, reply) => {
  try {
    const { rows } = await pool.query('SELECT current_database() AS database, NOW() AS checked_at');
    return { ok: true, database: rows[0].database, checkedAt: rows[0].checked_at };
  } catch {
    return reply.code(503).send({ ok: false, error: 'Database unavailable' });
  }
});
registerLocalRoutes(app, pool);
app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not implemented. Auth and protected routes are not enabled.' }));
const close = async () => { await app.close(); await pool.end(); };
process.once('SIGINT', () => void close().then(() => process.exit(0)));
process.once('SIGTERM', () => void close().then(() => process.exit(0)));
await app.listen({ host, port });
