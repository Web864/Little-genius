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
   await pool.query("UPDATE local_school_tenants SET expires_at=NOW()-INTERVAL '1 minute' WHERE school_id=$1",[schoolA]);
   assert.equal((await call('adminA','PUT','/api/school/curriculum',{...schoolConfig,version:2})).statusCode,403);
   await pool.query("UPDATE local_school_tenants SET expires_at=NOW()+INTERVAL '1 day' WHERE school_id=$1",[schoolA]);
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
  await t.test('six-game backups are account-isolated and reject invalid writes',async()=>{
    const snapshot={
      version:1,
      math:{numbers:[1,2,10],addition:[1,7]},
      curriculum:{records:{
        'phonics:0':{ok:2,wrong:1,tries:3,due:'2026-11-25'},
        'urdu:37':{ok:1,wrong:0,tries:1,due:'2026-11-25'}
      }}
    };

    // Account A saves its six-game progress.
    assert.equal(
      (await call('adult','PUT','/api/six-games/save',
        {password:PASSWORD,snapshot})).statusCode,200
    );

    // Account A retrieves exactly its own backup.
    assert.deepEqual(
      (await call('adult','POST','/api/six-games/load',
        {password:PASSWORD})).json().sixGameSnapshot,
      snapshot
    );

    // Account B cannot read Account A's backup.
    const other=await call('adminB','POST','/api/six-games/load',
      {password:PASSWORD,adultId:a.adult.id});

    assert.equal(other.statusCode,200);
    assert.equal(other.json().sixGameSnapshot,null);

    // Wrong password must not allow a read.
    assert.equal(
      (await call('adult','POST','/api/six-games/load',
        {password:'WrongPassword_2026'})).statusCode,401
    );

    // Invalid replacement must be rejected.
    const invalid={
      ...snapshot,
      math:{numbers:[1,1],addition:[1,7]}
    };

    assert.equal(
      (await call('adult','PUT','/api/six-games/save',
        {password:PASSWORD,snapshot:invalid})).statusCode,400
    );

    // Previous valid backup must remain unchanged.
    assert.deepEqual(
      (await call('adult','POST','/api/six-games/load',
        {password:PASSWORD})).json().sixGameSnapshot,
      snapshot
    );

    // Database ownership must come from the authenticated session.
    const stored=await pool.query(
      'SELECT adult_id FROM local_six_game_snapshots WHERE adult_id=$1',
      [a.adult.id]
    );

    assert.equal(stored.rowCount,1);
  });
  await t.test('unified progress APIs save and load account-scoped backups',async()=>{
    const alphabet={letters:['D','E'],courseComplete:false};
    const legacy={
      lost:{current:2,completed:['A','B']},
      picture:{last:'A',letters:{A:{success:2,wrong:1}}},
      quests:{completed:['forest']}
    };
    const sixGames={
      version:1,
      math:{numbers:[1,2,10],addition:[1,7]},
      curriculum:{records:{
        'phonics:0':{ok:2,wrong:0,tries:2,due:'2026-11-25'},
        'words:0':{ok:1,wrong:1,tries:2,due:'2026-11-25'}
      }}
    };
    const payload={password:PASSWORD,alphabet,legacy,sixGames};

    const save=await call('adult','PUT','/api/progress/all/save',payload);
    assert.equal(save.statusCode,200,save.body);
    assert.equal(save.json().ok,true);

    const load=await call('adult','POST','/api/progress/all/load',
      {password:PASSWORD});
    assert.equal(load.statusCode,200,load.body);
    assert.deepEqual(load.json().alphabetSnapshot,alphabet);
    assert.deepEqual(load.json().legacySnapshot,legacy);
    assert.deepEqual(load.json().sixGameSnapshot,sixGames);
    assert.ok(Array.isArray(load.json().results));

    // A submitted adultId must never override authenticated ownership.
    const other=await call('adminB','POST','/api/progress/all/load',
      {password:PASSWORD,adultId:a.adult.id});
    assert.equal(other.statusCode,200,other.body);
    assert.notDeepEqual(other.json().sixGameSnapshot,sixGames);

    const wrong=await call('adult','POST','/api/progress/all/load',
      {password:'WrongPassword_2026'});
    assert.equal(wrong.statusCode,401);

    const anonymous=await call(null,'POST','/api/progress/all/load',
      {password:PASSWORD});
    assert.equal(anonymous.statusCode,401);

    const invalid=await call('adult','PUT','/api/progress/all/save',{
      ...payload,
      sixGames:{
        ...sixGames,
        math:{numbers:[1,1],addition:[1,7]}
      }
    });
    assert.equal(invalid.statusCode,400,invalid.body);

    // Validation failure must not replace any saved snapshot.
    const after=await call('adult','POST','/api/progress/all/load',
      {password:PASSWORD});
    assert.equal(after.statusCode,200,after.body);
    assert.deepEqual(after.json().alphabetSnapshot,alphabet);
    assert.deepEqual(after.json().legacySnapshot,legacy);
    assert.deepEqual(after.json().sixGameSnapshot,sixGames);

    // Individual APIs must remain compatible.
    const old=await call('adult','POST','/api/legacy/load',
      {password:PASSWORD});
    assert.deepEqual(old.json().legacySnapshot,legacy);
  });
  await t.test('unified backup rolls back earlier writes when final database write fails',async()=>{
    const beforeResponse=await call(
      'adult','POST','/api/progress/all/load',{password:PASSWORD}
    );
    assert.equal(beforeResponse.statusCode,200,beforeResponse.body);
    const before=beforeResponse.json();

    assert.ok(before.alphabetSnapshot);
    assert.ok(before.legacySnapshot);
    assert.ok(before.sixGameSnapshot);

    // Reuse the real PostgreSQL pool, but simulate a failure on the
    // THIRD INSERT of the unified save. Earlier writes really execute
    // inside the transaction and must then be rolled back.
    const failingPool={
      query:(...args)=>pool.query(...args),
      connect:async()=>{
        const db=await pool.connect();
        return {
          query:(sql,...args)=>{
            if(typeof sql==='string' &&
               /INSERT INTO local_six_game_snapshots/i.test(sql)){
              return Promise.reject(
                new Error('simulated-third-write-failure')
              );
            }
            return db.query(sql,...args);
          },
          release:()=>db.release()
        };
      }
    };

    const failingApp=createApp(failingPool);

    try {
      const changedAlphabet={
        letters:['X','Y','Z'],courseComplete:false
      };
      const changedLegacy={
        lost:{current:5,completed:['X','Y']},
        picture:{last:'X',letters:{
          X:{success:5,wrong:0}
        }},
        quests:{completed:['space']}
      };

      const response=await failingApp.inject({
        method:'PUT',
        url:'/api/progress/all/save',
        headers:{...headers,cookie:a.adult.cookie},
        payload:{
          password:PASSWORD,
          alphabet:changedAlphabet,
          legacy:changedLegacy,
          sixGames:before.sixGameSnapshot
        }
      });

      assert.equal(response.statusCode,500,response.body);
      assert.ok(!response.body.includes('simulated-third-write-failure'));
    }finally{
      await failingApp.close();
    }

    // The first two updates MUST NOT survive the failed transaction.
    const afterResponse=await call(
      'adult','POST','/api/progress/all/load',{password:PASSWORD}
    );
    assert.equal(afterResponse.statusCode,200,afterResponse.body);
    const after=afterResponse.json();

    assert.deepEqual(after.alphabetSnapshot,before.alphabetSnapshot);
    assert.deepEqual(after.legacySnapshot,before.legacySnapshot);
    assert.deepEqual(after.sixGameSnapshot,before.sixGameSnapshot);
    assert.deepEqual(after.results,before.results);
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

test('Fastify handles missing database without exposing connection details',async()=>{
 const pool={query:async()=>{throw Error('private connection failure');},connect:async()=>{throw Error('private connection failure');}};
 const app=createApp(pool);
 try {
  const health=await app.inject('/api/health/db');assert.equal(health.statusCode,503);assert.equal(health.json().error,'Database unavailable');
  const response=await app.inject({url:'/api/account/capabilities',headers:{cookie:'lga_local_session='+'a'.repeat(64)}});
  assert.equal(response.statusCode,503);assert.ok(!response.body.includes('private'));
 }finally{await app.close();}
});
