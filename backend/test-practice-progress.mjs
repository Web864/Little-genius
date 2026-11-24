import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { registerLocalRoutes } from './src/localAuth.js';
const scrypt = promisify(scryptCb);
const pwA = 'LocalOnlyPasswordAAAA123';
const pwB = 'LocalOnlyPasswordBBBB123';
function harness() {
  const routes = {}, adults = new Map(), sessions = new Map(), progress = new Map();
  const pool = { async query(sql, args=[]) {
    if (sql.startsWith('SELECT a.id,a.email FROM local_sessions')) {
      const id = sessions.get(args[0]);
      return { rows: id ? [{id,email:adults.get(id)?.email}] : [] };
    }
    if (sql.startsWith('SELECT salt,password_hash FROM local_adults WHERE id=')) {
      return {rows:adults.has(args[0]) ? [adults.get(args[0])] : []};
    }
    if (sql.startsWith('SELECT game_id, best_score, last_score, attempts FROM local_practice_results')) {
      return { rows:[...progress.entries()].filter(([key])=>key.startsWith(args[0]+'|'))
        .map(([key,r])=>({game_id:key.split('|')[1],best_score:r.bestScore,last_score:r.lastScore,attempts:r.attempts})) };
    }
    if (sql.includes('INSERT INTO local_practice_results')) {
      const key=args[0]+'|'+args[1], score=args[2], prev=progress.get(key);
      const row={bestScore:Math.max(prev?.bestScore??0,score),lastScore:score,attempts:(prev?.attempts??0)+1};
      progress.set(key,row);
      return {rows:[{game_id:args[1],best_score:row.bestScore,last_score:row.lastScore,attempts:row.attempts}]};
    }
    throw new Error('Unexpected SQL: '+sql.slice(0,80));
  }};
  registerLocalRoutes({ post:(path,fn)=>routes['POST '+path]=fn, put:(path,fn)=>routes['PUT '+path]=fn, get:(path,fn)=>routes['GET '+path]=fn },pool);
  async function add(id,email,pw,token) {
    const salt='00000000000000000000000000000000';
    adults.set(id,{email,salt,password_hash:(await scrypt(pw,salt,64)).toString('hex')});
    sessions.set(createHash('sha256').update(token).digest('hex'),id);
  }
  async function call(method,path,token,body) {
    const req={ip:'127.0.0.2',headers:{origin:'http://127.0.0.1:5173','x-lga-local-client':'1',cookie:token?'lga_local_session='+token:''},body};
    const reply={statusCode:200,code(n){this.statusCode=n;return this;},send(v){this.body=v;return this;},header(){return this;}};
    const value=await routes[method+' '+path](req,reply);
    return {status:reply.statusCode,data:reply.body??value};
  }
  return {add,call,progress};
}
const tokenA='a'.repeat(64),tokenB='b'.repeat(64);
test('draft progress is optional, correctly scoped, and retains best score',async()=>{
  const h=harness();await h.add('a','a@example.invalid',pwA,tokenA);await h.add('b','b@example.invalid',pwB,tokenB);
  assert.deepEqual((await h.call('POST','/api/practice/load',tokenA,{password:pwA})).data.results,[]);
  assert.equal(h.progress.size,0); // no automatic progress storage
  assert.equal((await h.call('POST','/api/practice/complete',tokenA,{password:pwA,gameId:'sorting',score:4,total:4})).status,200);
  assert.equal((await h.call('POST','/api/practice/complete',tokenA,{password:pwA,gameId:'sorting',score:2,total:4})).data.result.bestScore,4);
  const a=await h.call('POST','/api/practice/load',tokenA,{password:pwA});
  assert.deepEqual(a.data.results,[{gameId:'sorting',bestScore:4,lastScore:2,attempts:2}]);
  assert.deepEqual((await h.call('POST','/api/practice/load',tokenB,{password:pwB})).data.results,[]);
  assert.equal(h.progress.size,1);
});
test('wrong password, missing cookie, malformed score cannot alter stored practice',async()=>{
  const h=harness();await h.add('a','a@example.invalid',pwA,tokenA);
  assert.equal((await h.call('POST','/api/practice/complete',null,{password:pwA,gameId:'nature',score:3,total:4})).status,401);
  assert.equal((await h.call('POST','/api/practice/load',tokenA,{password:pwB})).status,401);
  assert.equal((await h.call('POST','/api/practice/complete',tokenA,{password:pwB,gameId:'nature',score:3,total:4})).status,401);
  assert.equal((await h.call('POST','/api/practice/complete',tokenA,{password:pwA,gameId:'nature',score:5,total:4})).status,400);
  assert.equal((await h.call('POST','/api/practice/complete',tokenA,{password:pwA,gameId:'abc',score:3,total:4})).status,400);
  assert.equal(h.progress.size,0);
});
test('no client-provided adult_id is trusted',async()=>{
  const h=harness();await h.add('a','a@example.invalid',pwA,tokenA);await h.add('b','b@example.invalid',pwB,tokenB);
  const response=await h.call('POST','/api/practice/complete',tokenA,{adultId:'b',password:pwA,gameId:'patterns',score:3,total:4});
  assert.equal(response.status,200);
  assert.ok(h.progress.has('a|patterns'));
  assert.ok(!h.progress.has('b|patterns'));
});
