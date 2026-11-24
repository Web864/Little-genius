import 'dotenv/config';
import { createApp } from './app.js';
import { Pool } from 'pg';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '4000');
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error('This starter is local-only; HOST must be 127.0.0.1 or localhost.');
}
if (!process.env.DATABASE_URL) throw new Error('Copy .env.example to .env and set DATABASE_URL.');
const dbUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !(dbUrl.pathname === '/little_genius_dev' || /^\/lga_consolidation_test_[a-z0-9_]+$/.test(dbUrl.pathname))) {
  throw new Error('LOCAL ONLY: use a localhost PostgreSQL database named little_genius_dev.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });
pool.on('error', error => console.error('Idle database connection error:', error.message));
const app=createApp(pool,{logger:true});
const close = async () => { await app.close(); await pool.end(); };
process.once('SIGINT', () => void close().then(() => process.exit(0)));
process.once('SIGTERM', () => void close().then(() => process.exit(0)));
await app.listen({ host, port });
