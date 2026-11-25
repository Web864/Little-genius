import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const backendDir = new URL('./backend/', import.meta.url);
const require = createRequire(new URL('package.json', backendDir));
const { parse } = require('dotenv');
const { Pool } = require('pg');
const envPath = process.env.LGA_ENV_FILE ?? new URL('.env', backendDir);
const env = parse(readFileSync(envPath));
let pool;
try {
 const url = new URL(env.DATABASE_URL);
 if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname !== '/little_genius_dev') throw new Error('Non-approved database target');
 console.log('Target: approved local development database; credentials redacted');
 pool = new Pool({connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3000, max:1});
 const client = await pool.connect();
 try {
  await client.query('BEGIN READ ONLY');
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log(JSON.stringify({tables:tables.rows.map(r=>r.table_name)}));
  if(tables.rows.some(r=>r.table_name==='app_schema_versions')) console.log(JSON.stringify((await client.query('SELECT version FROM app_schema_versions ORDER BY version')).rows));
  await client.query('ROLLBACK');
 } finally {client.release();}
 console.log('Read-only PostgreSQL verification PASS');
} catch(error) {console.log('Read-only PostgreSQL verification FAILED; code='+(error.code || 'configuration/dependency'));process.exitCode=1;}
finally {if(pool) await pool.end();}
