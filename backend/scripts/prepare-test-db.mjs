import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { testUrl,TEST_DATABASE,testPool } from '../test-support/database.js';
const admin=new Pool({connectionString:testUrl('postgres'),connectionTimeoutMillis:3000,max:1});
try {
 const found=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[TEST_DATABASE]);
 if(!found.rowCount)await admin.query('CREATE DATABASE "'+TEST_DATABASE+'"');
 console.log('Isolated test database available; existing dev DB untouched.');
} catch(error){console.error('Test DB preparation failed; code='+error.code);process.exitCode=1;}
finally {await admin.end();}
if(!process.exitCode){const pool=testPool();try {
 for(const name of ['schema.sql','schema-v2.sql','schema-v3.sql','schema-v4.sql','schema-v5.sql','schema-v6.sql','schema-v7.sql'])await pool.query(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));
 console.log('Isolated test migrations v1-v7 PASS');
} catch(error){console.error('Test migrations failed; code='+error.code);process.exitCode=1;}finally{await pool.end();}}
