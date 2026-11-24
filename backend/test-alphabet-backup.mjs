import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { registerLocalRoutes, validateAlphabetSnapshot } from './src/localAuth.js';
const scrypt = promisify(scryptCb);
const passwordA = 'TestAccount-A-123456';
const passwordB = 'TestAccount-B-123456';
const tokens = { a: 'a'.repeat(64), b: 'b'.repeat(64) };
async function setup() {
  const routes = new Map(), snapshots = new Map(), adults = new Map(), sessions = new Map();
  const pool = {async query(sql, args=[]) {
    if (sql.startsWith('SELECT a.id,a.email FROM local_sessions')) {
      const id = sessions.get(args[0]);
      return { rows: id ? [{ id, email: adults.get(id).email }] : [] };
    }
    if (sql.startsWith('SELECT salt,password_hash FROM local_adults WHERE id=')) {
      const adult = adults.get(args[0]); return { rows: adult ? [adult] : [] };
    }
    if (sql.startsWith('SELECT letters,course_complete FROM local_alphabet_snapshots')) {
      const snapshot = snapshots.get(args[0]);
      return { rows: snapshot ? [{ letters: snapshot.letters, course_complete: snapshot.courseComplete }] : [] };
    }
    if (sql.includes('INSERT INTO local_alphabet_snapshots')) {
      snapshots.set(args[0], { letters: JSON.parse(args[1]), courseComplete: args[2] }); return { rows: [] };
    }
    throw new Error('Unexpected SQL: '+sql.slice(0,100));
  }};
  registerLocalRoutes({
    get(path, fn) { routes.set('GET '+path, fn); },
    post(path, fn) { routes.set('POST '+path, fn); },
    put(path, fn) { routes.set('PUT '+path, fn); },
  }, pool);
  for (const [id, password] of [['a',passwordA],['b',passwordB]]) {
    const salt = '0123456789abcdef0123456789abcdef';
    adults.set(id, {email:id+'@example.invalid', salt, password_hash:(await scrypt(password,salt,64)).toString('hex')});
    sessions.set(createHash('sha256').update(tokens[id]).digest('hex'),id);
  }
  async function call(method, path, id, body, extraHeaders={}) {
    const req = { ip:'127.0.0.2',headers:{ origin:'http://localhost:5173', 'x-lga-local-client':'1', cookie:id?`lga_local_session=${tokens[id]}`:'',...extraHeaders },body };
    const reply = { statusCode:200, code(n) { this.statusCode=n; return this; },send(payload){this.body=payload;return this;} };
    const result = await routes.get(method+' '+path)(req,reply);
    return {status:reply.statusCode,data:reply.body??result};
  }
  return {call,snapshots};
}
test('alphabet backup is explicitly password gated, isolated across two adult accounts', async () => {
  const h=await setup();
  assert.deepEqual((await h.call('POST','/api/alphabet/load','a',{password:passwordA})).data,{snapshot:null});
  assert.equal((await h.call('PUT','/api/alphabet/save','a',{password:passwordA,snapshot:{letters:['C','A'],courseComplete:false}})).status,200);
  assert.deepEqual((await h.call('POST','/api/alphabet/load','a',{password:passwordA})).data.snapshot,{letters:['A','C'],courseComplete:false});
  assert.deepEqual((await h.call('POST','/api/alphabet/load','b',{password:passwordB})).data,{snapshot:null});
  assert.equal(h.snapshots.size,1);
  assert.deepEqual(h.snapshots.get('a').letters,['A','C']);
});
test('alphabet backup rejects anonymous, wrong password, and invalid snapshots', async () => {
  const h=await setup();
  const good={letters:['A','B'],courseComplete:false};
  assert.equal((await h.call('PUT','/api/alphabet/save',null,{password:passwordA,snapshot:good})).status,401);
  assert.equal((await h.call('PUT','/api/alphabet/save','a',{password:passwordB,snapshot:good})).status,401);
  assert.equal((await h.call('PUT','/api/alphabet/save','a',{password:passwordA,snapshot:{letters:['A','A'],courseComplete:false}})).status,400);
  assert.equal((await h.call('PUT','/api/alphabet/save','a',{password:passwordA,snapshot:{letters:['A'],courseComplete:true}})).status,400);
  assert.equal(h.snapshots.size,0);
});
test('alphabet backup ignores client adultId and validates alphabet strictness', async () => {
  const h=await setup();
  const response=await h.call('PUT','/api/alphabet/save','a',{adultId:'b',password:passwordA,snapshot:{letters:['D'],courseComplete:false}});
  assert.equal(response.status,200);
  assert.ok(h.snapshots.has('a')); assert.equal(h.snapshots.has('b'),false);
  assert.equal(validateAlphabetSnapshot({letters:['1'],courseComplete:false}).valid,false);
  assert.equal(validateAlphabetSnapshot({letters:[],courseComplete:false,childName:'X'}).valid,false);
  assert.equal(validateAlphabetSnapshot({letters:'ABC',courseComplete:false}).valid,false);
});
