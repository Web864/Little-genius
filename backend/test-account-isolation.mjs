import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrypt as scryptCb, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { registerLocalRoutes } from './src/localAuth.js';
const scrypt = promisify(scryptCb);
const PASSWORD_A = 'FictionalTestPasswordA_2244';
const PASSWORD_B = 'FictionalTestPasswordB_3355';
const makeProfile = countryCode => ({ schema: 1, status: 'completed', updatedAt: '2026-11-23T10:00:00Z', setting: 'home', countryCode, frameworkId: 'intl-core', stage: 'A4', languages: ['en'], modules: [] });
function createHarness() {
  const routes = {};
  const adults = new Map();
  const sessions = new Map();
  const profiles = new Map();
  const pool = { async query(sql, params=[]) {
    if (sql.startsWith('SELECT a.id,a.email FROM local_sessions')) {
      const id = sessions.get(params[0]);
      return { rows: id ? [{ id, email: adults.get(id)?.email }] : [] };
    }
    if (sql.startsWith('SELECT salt,password_hash FROM local_adults WHERE id=')) {
      const a = adults.get(params[0]); return { rows: a ? [a] : [] };
    }
    if (sql.startsWith('SELECT profile FROM local_aics_profiles')) return { rows: profiles.has(params[0]) ? [{profile: profiles.get(params[0])}] : [] };
    if (sql.startsWith('INSERT INTO local_aics_profiles')) { profiles.set(params[0], JSON.parse(params[1])); return {rows:[]}; }
    throw Error('Unexpected SQL: '+sql.slice(0,70));
  }};
  registerLocalRoutes({ post: (url,fn)=>routes['POST '+url]=fn, put:(url,fn)=>routes['PUT '+url]=fn, get:(url,fn)=>routes['GET '+url]=fn }, pool);
  async function addAdult(id,email,password, token) {
    const salt = id.padEnd(32,'0');
    const password_hash = (await scrypt(password, salt, 64)).toString('hex');
    adults.set(id,{id,email,salt,password_hash});
    sessions.set(createHash('sha256').update(token).digest('hex'),id);
  }
  async function call(method,url,token,body) {
    const request={ ip:'127.0.0.1', headers:{origin:'http://127.0.0.1:5173','x-lga-local-client':'1', cookie:token ? `lga_local_session=${token}`: ''}, body };
    const reply={statusCode:200, code(n){ this.statusCode=n;return this;},send(v){ this.sent=v;return this;},header(){return this;}};
    const result=await routes[method+' '+url](request,reply);
    return { code:reply.statusCode, value: reply.sent??result };
  }
  return {addAdult,call,profiles};
}
const tokenA='a'.repeat(64), tokenB='b'.repeat(64);
test('profile access requires a session plus password; account B cannot read or overwrite A', async () => {
  const h=createHarness();
  await h.addAdult('adult-a','a@example.invalid',PASSWORD_A,tokenA);
  await h.addAdult('adult-b','b@example.invalid',PASSWORD_B,tokenB);
  const a=makeProfile('PK');
  assert.equal((await h.call('PUT','/api/profile',tokenA,{password:PASSWORD_A,profile:a})).code,200);
  assert.equal((await h.call('POST','/api/profile/load',tokenB,{password:PASSWORD_B})).value.profile,null);
  assert.equal((await h.call('POST','/api/profile/load',tokenB,{password:PASSWORD_A})).code,401);
  assert.equal((await h.call('PUT','/api/profile',tokenB,{password:PASSWORD_A,profile:makeProfile('GB')})).code,401);
  assert.equal((await h.call('POST','/api/profile/load',tokenA,{password:PASSWORD_A})).value.profile.countryCode,'PK');
  assert.equal(h.profiles.size,1);
});
test('anonymous request and missing password cannot read or write saved profiles', async () => {
  const h=createHarness();
  await h.addAdult('adult-c','c@example.invalid',PASSWORD_A,tokenA);
  assert.equal((await h.call('POST','/api/profile/load',null,{password:PASSWORD_A})).code,401);
  assert.equal((await h.call('POST','/api/profile/load',tokenA,{})).code,401);
  assert.equal((await h.call('PUT','/api/profile',null,{password:PASSWORD_A,profile:makeProfile('PK')})).code,401);
  assert.equal(h.profiles.size,0);
});
test('invalid profile and wrong password do not overwrite a saved profile', async () => {
  const h=createHarness();
  await h.addAdult('adult-d','d@example.invalid',PASSWORD_A,tokenA);
  assert.equal((await h.call('PUT','/api/profile',tokenA,{password:PASSWORD_A,profile:makeProfile('PK')})).code,200);
  assert.equal((await h.call('PUT','/api/profile',tokenA,{password:'wrong-password-12345',profile:makeProfile('GB')})).code,401);
  assert.equal((await h.call('PUT','/api/profile',tokenA,{password:PASSWORD_A,profile:{malicious:'field'}})).code,400);
  assert.equal(h.profiles.get('adult-d').countryCode,'PK');
});
