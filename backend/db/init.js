import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/little_genius_dev') {
  throw new Error('Refusing migration: only localhost database little_genius_dev is allowed.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000 });
try {
  const schema = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await pool.query(schema);
  const schemaV2 = await readFile(fileURLToPath(new URL('./schema-v2.sql', import.meta.url)), 'utf8');
  await pool.query(schemaV2);
  const schemaV3 = await readFile(fileURLToPath(new URL('./schema-v3.sql', import.meta.url)), 'utf8');
  await pool.query(schemaV3);
  const schemaV4 = await readFile(fileURLToPath(new URL('./schema-v4.sql', import.meta.url)), 'utf8');
  await pool.query(schemaV4);
  const schemaV5 = await readFile(fileURLToPath(new URL('./schema-v5.sql', import.meta.url)), 'utf8');
  await pool.query(schemaV5);
  console.log('Local schemas v1–v5 initialized (additive). Existing data preserved.');
} finally { await pool.end(); }
