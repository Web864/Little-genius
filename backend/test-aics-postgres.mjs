import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from './src/app.js';
import { ownerStore,withAicsTransaction } from './src/aicsRoutes.js';
import { testPool } from './test-support/database.js';
import { seedFixture,PASSWORD,headers,schoolConfig } from './test-support/fixtures.js';

test('real PostgreSQL: local auth, backups, AICS authorization, migration and atomicity', {skip:process.env.LGA_REAL_DB_TEST!=='1'},async t=>{
 const pool=testPool(),app=createApp(pool);
 try {
  assert.equal((await app.inject('/api/health/db')).statusCode,200);
  const {accounts:a,schoolA,orgA,orgB}=await seedFixture(app,pool);
  const call=(role,method,url,payload)=>app.inject({method,url,headers:{...headers,...(role?{cookie:a[role].cookie}:{})},...(payload===undefined?{}:{payload})});
  await t.test('anonymous/regular adults cannot claim school or owner permissions',async()=>{
   assert.equal((await call(null,'GET','/api/curriculum/owner/packs')).statusCode,401);
   for(const role of ['adult','adminA','teacherA','adminB'])assert.equal((await call(role,'POST','/api/curriculum/owner/create',{role:'owner',frameworkId:'intl-core'})).statusCode,403);
   assert.equal((await call('adult','GET','/api/school/curriculum')).statusCode,403);
   assert.equal((await call('owner','GET','/api/school/curriculum')).statusCode,403);
  });
  await t.test('school administrator writes; teacher reads only; cross-school records stay isolated',async()=>{
   assert.equal((await call('adminA','PUT','/api/school/curriculum',schoolConfig)).statusCode,200);
   assert.equal((await call('teacherA','GET','/api/school/curriculum')).json().config.version,1);
   assert.equal((await call('teacherA','PUT','/api/school/curriculum',schoolConfig)).statusCode,403);
   assert.equal((await call('adminB','GET','/api/school/curriculum')).json().config,null);
   assert.equal((await call('adminB','PUT','/api/school/curriculum',{...schoolConfig,schoolId:schoolA})).statusCode,400);
   assert.equal((await call('adminA','PUT','/api/school/curriculum',schoolConfig)).statusCode,409);
   // Two clients with the same version: exactly one wins.
   const responses=await Promise.all([call('adminA','PUT','/api/school/curriculum',{...schoolConfig,version:1}),call('adminA','PUT','/api/school/curriculum',{...schoolConfig,version:1})]);
   assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);
   // Composite FK prevents cross-organization membership assignments.
   await assert.rejects(pool.query('UPDATE local_school_memberships SET organization_id=$2 WHERE adult_id=$1',[a.teacherA.id,orgB]),e=>e.code==='23503');
   await pool.query('UPDATE local_organizations SET active=FALSE WHERE id=$1',[orgA]);
   assert.equal((await call('teacherA','GET','/api/school/curriculum')).statusCode,403);
   await pool.query('UPDATE local_organizations SET active=TRUE WHERE id=$1',[orgA]);
  });
  await t.test('owner release rules, revocation, audit and unreviewed Draft gates',async()=>{
   const packs=await call('owner','GET','/api/curriculum/owner/packs');assert.equal(packs.statusCode,200);assert.ok(packs.json().packs.length);
   // Use an unused selectable release if this persistent isolated fixture was run before.
   const pack=packs.json().packs.find(p=>p.selectable&&!p.release);
   if(pack){
    const created=await call('owner','POST','/api/curriculum/owner/create',{frameworkId:pack.frameworkId});assert.equal(created.statusCode,200);
    const release=created.json().release;assert.equal(release.state,'draft');
    assert.equal((await call('owner','POST','/api/curriculum/owner/publish',{releaseId:release.id,expectedRev:release.rev})).statusCode,409);
    const submitted=await call('owner','POST','/api/curriculum/owner/submit',{releaseId:release.id,expectedRev:release.rev});assert.equal(submitted.statusCode,200);
    assert.equal((await call('owner','POST','/api/curriculum/owner/approve',{releaseId:release.id,expectedRev:submitted.json().release.rev})).statusCode,422);
    assert.equal((await call('owner','POST','/api/curriculum/owner/revoke',{frameworkId:pack.frameworkId,reason:'Fictional test revoke'})).statusCode,200);
   }
   assert.deepEqual((await call('adult','GET','/api/curriculum/manifest')).json().published,[]);
   assert.ok((await call('owner','GET','/api/curriculum/owner/audit')).json().audit.some(x=>x.actor===a.adminA.id));
   assert.equal((await app.inject({method:'POST',url:'/api/curriculum/owner/create',headers:{cookie:a.owner.cookie},payload:{frameworkId:'intl-core'}})).statusCode,403);
  });
  await t.test('real account backups retain compatibility and reject wrong identity/password',async()=>{
   const snapshot={letters:['A','B'],courseComplete:false};
   assert.equal((await call('adult','PUT','/api/alphabet/save',{password:PASSWORD,snapshot})).statusCode,200);
   assert.equal((await call('adminB','POST','/api/alphabet/load',{password:PASSWORD,adultId:a.adult.id})).json().snapshot,null);
   assert.deepEqual((await call('adult','POST','/api/alphabet/load',{password:PASSWORD})).json().snapshot,snapshot);
   assert.equal((await call('adult','POST','/api/alphabet/load',{password:'WrongPassword_2026'})).statusCode,401);
   const legacy={lost:{current:1,completed:['A']},picture:{last:'A',letters:{A:{success:1,wrong:0}}},quests:{completed:['forest']}};
   assert.equal((await call('adult','PUT','/api/legacy/save',{password:PASSWORD,snapshot:legacy})).statusCode,200);
   assert.deepEqual((await call('adult','POST','/api/legacy/load',{password:PASSWORD})).json().legacySnapshot,legacy);
   assert.equal((await call('adminB','POST','/api/legacy/load',{password:PASSWORD})).json().legacySnapshot,null);
   assert.equal((await call('adult','PUT','/api/alphabet/save',{password:PASSWORD,snapshot:{letters:['bad'],courseComplete:false}})).statusCode,400);
   const migration=await readFile(new URL('./db/schema-v6.sql',import.meta.url),'utf8');await pool.query(migration);
   assert.deepEqual((await call('adult','POST','/api/alphabet/load',{password:PASSWORD})).json().snapshot,snapshot);
   assert.equal((await call('adult','POST','/api/auth/logout')).statusCode,200);
   assert.equal((await call('adult','POST','/api/alphabet/load',{password:PASSWORD})).statusCode,401);
  });
  await t.test('CAS failure rolls back earlier writes and transaction exception rolls back audit',async()=>{
   const audit={id:crypto.randomUUID(),actor:a.owner.id,at:new Date().toISOString(),action:'test-rollback',releaseId:'none',detail:'fictional'};
   const result=await withAicsTransaction(pool,db=>ownerStore(db).commit([{kind:'audit',value:audit},{kind:'current',frameworkId:'missing',value:null,expectedReleaseId:'wrong'}]));
   assert.equal(result,false);assert.equal((await pool.query('SELECT 1 FROM local_aics_audit WHERE id=$1',[audit.id])).rowCount,0);
   await assert.rejects(withAicsTransaction(pool,async db=>{await ownerStore(db).commit([{kind:'audit',value:audit}]);throw Error('rollback');}));
   assert.equal((await pool.query('SELECT 1 FROM local_aics_audit WHERE id=$1',[audit.id])).rowCount,0);
  });
 } finally {await app.close();await pool.end();}
});
