import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrypt as scryptCb, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { registerLocalRoutes } from './src/localAuth.js';
const scrypt = promisify(scryptCb);
function makeHarness() {
  const routes = {}, sessions = new Map(), adults = new Map(), snapshots = new Map();
  const pool = { async query(sql, args = []) {
    if (sql.startsWith('SELECT a.id,a.email FROM local_sessions')) {
      const id = sessions.get(args[0]); return { rows: id ? [{id,email:adults.get(id)?.email}] : [] };
    }
    if (sql.startsWith('SELECT salt,password_hash FROM local_adults WHERE id=')) {
      return { rows: adults.has(args[0]) ? [adults.get(args[0])] : [] };
    }
    if (sql.startsWith('SELECT snapshot FROM local_legacy_game_snapshots')) {
      return { rows: snapshots.has(args[0]) ? [{snapshot:snapshots.get(args[0])}] : [] };
    }
    if (sql.startsWith('INSERT INTO local_legacy_game_snapshots')) {
      snapshots.set(args[0], JSON.parse(args[1])); return { rows:[] };
    }
    throw Error(`Unexpected SQL ${sql.slice(0,65)}`);
  }};
  registerLocalRoutes({ post:(k,v)=>routes[`POST ${k}`]=v,
    put:(k,v)=>routes[`PUT ${k}`]=v, get:(k,v)=>routes[`GET ${k}`]=v },pool);
  return {
    snapshots,
    async add(id, password, token) {
      const salt=id.padEnd(32,'0');
      const password_hash=(await scrypt(password,salt,64)).toString('hex');
      adults.set(id,{id,email:id+'@example.invalid',salt,password_hash});
      sessions.set(createHash('sha256').update(token).digest('hex'),id);
    },
    async call(method,route,token,body) {
      const request={ip:'127.0.0.1',headers:{origin:'http://127.0.0.1:5173',
        'x-lga-local-client':'1',cookie:token?`lga_local_session=${token}`:''},body};
      const reply={statusCode:200,code(n){this.statusCode=n;return this;},send(v){this.sent=v;return this;},header(){return this;}};
      const result=await routes[`${method} ${route}`](request,reply);
      return {code:reply.statusCode,value:reply.sent??result};
    }
  };
}
const passA='LocalFictional_A_SecurePass_123', passB='LocalFictional_B_SecurePass_456';
const tokA='a'.repeat(64),tokB='b'.repeat(64);
const snap={lost:{current:1,completed:['A']},picture:{last:'B',letters:{A:{success:1,wrong:0}}},quests:{completed:['forest']}};
test('legacy backup is password protected and account-isolated', async()=>{
  const h=makeHarness(); await h.add('adult-a',passA,tokA); await h.add('adult-b',passB,tokB);
  assert.equal((await h.call('PUT','/api/legacy/save',tokA,{password:passA,snapshot:snap})).code,200);
  assert.equal((await h.call('POST','/api/legacy/load',tokA,{password:passA})).value.legacySnapshot.lost.completed[0],'A');
  assert.equal((await h.call('POST','/api/legacy/load',tokB,{password:passB})).value.legacySnapshot,null);
  assert.equal((await h.call('POST','/api/legacy/load',tokB,{password:passA})).code,401);
  assert.equal(h.snapshots.size,1);
});
test('legacy backup rejects anonymous, wrong-password, and extra private fields', async()=>{
  const h=makeHarness(); await h.add('adult-a',passA,tokA);
  assert.equal((await h.call('PUT','/api/legacy/save',null,{password:passA,snapshot:snap})).code,401);
  assert.equal((await h.call('PUT','/api/legacy/save',tokA,{password:passB,snapshot:snap})).code,401);
  assert.equal((await h.call('PUT','/api/legacy/save',tokA,{password:passA,snapshot:{...snap,child:'private'}})).code,400);
  assert.equal(h.snapshots.size,0);
});
