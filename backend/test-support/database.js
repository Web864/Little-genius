import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
export const TEST_DATABASE='lga_consolidation_test_20261124';
export function testUrl(database=TEST_DATABASE) {
 const path=process.env.LGA_ENV_FILE ?? fileURLToPath(new URL('../.env', import.meta.url));
 const config=parse(readFileSync(path)); const url=new URL(config.DATABASE_URL);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/little_genius_dev')throw Error('Expected existing LOCAL dev configuration');
 if(database!==TEST_DATABASE && database!=='postgres')throw Error('Invalid test database target');
 url.pathname='/'+database; return url.toString();
}
export function testPool(){return new Pool({connectionString:testUrl(),connectionTimeoutMillis:3000,max:4});}
