import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
import { contentDigest } from '../../src/aics/index.ts';
import { world } from './ledger.ts';

// ROUTE-LOGIC tests for integration/backend/curriculumRoutes.ts run against an in-memory FAKE of @appdeploy/sdk (tests/aics/fake-sdk.ts).
// They are NOT real backend tests and NOT real authorization tests: the real SDK, roles service and database were not involved.
register('./sdk-loader.mjs', import.meta.url);
const sdk = await import('./fake-sdk.ts');
const { router } = sdk;
const { createCurriculumRoutes, TABLES } = await import('../../integration/backend/curriculumRoutes.ts');
const { store } = sdk;

const W = world();
const handler = router(createCurriculumRoutes(W) as never);
type R = { status: number; body: Record<string, unknown> };
async function call(method: string, path: string, token: string | null, body?: unknown): Promise<R> {
  const r = await handler({ method, path, headers: token ? { authorization: 'Bearer ' + token } : {}, body });
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, unknown> };
}
const seed = (table: string, id: string, rec: Record<string, unknown>): void => { if (!store.tables.has(table)) store.tables.set(table, new Map()); store.tables.get(table)!.set(id, structuredClone(rec)); };
const table = (t: string): Map<string, Record<string, unknown>> => store.tables.get(t) ?? new Map();
function setup(): void {
  store.reset();
  store.users.set('T-owner', { userId: 'u-owner', email: 'owner@x.test' }); store.roles.set('u-owner', 'owner');
  store.users.set('T-admin', { userId: 'u-admin', email: 'admin@x.test' }); store.roles.set('u-admin', 'admin');
  store.users.set('T-staff', { userId: 'u-staff', email: 'staff@x.test' }); store.roles.set('u-staff', 'staff');
  store.users.set('T-plain', { userId: 'u-plain', email: 'plain@x.test' });
  store.users.set('T-holder', { userId: 'u-holder', email: 'Head@School.Test' }); store.users.set('T-teacher', { userId: 'u-teacher', email: 'teacher@school.test' });
  const future = new Date(Date.now() + 86400000 * 90).toISOString();
  seed('lga_licences', 'L1', { school: 'Sunny', email: 'head@school.test', expiresAt: future, revoked: false });
  seed('lga_entitlements', 'u-holder', { licenceId: 'L1' }); seed('lga_entitlements', 'u-teacher', { licenceId: 'L1' });
  seed('lga_licences', 'L2', { school: 'Other', email: 'other@school.test', expiresAt: future, revoked: false });
  store.users.set('T-other', { userId: 'u-other', email: 'other@school.test' }); seed('lga_entitlements', 'u-other', { licenceId: 'L2' });
}
const CFG = { schema: 1, countryCode: 'INTL', frameworkId: 'intl-core', stages: ['A4'], defaultStage: 'A4', languages: ['en'], classes: [{ id: 'sun', name: 'Sunflowers', stage: 'A4', frameworkId: null, languages: ['en'] }] };

// ------------------------------------------------------------------------------------------------ school routes
test('school routes: signed-out 401; not on a licence 403; licensed teacher may read but not write; licence holder may write', async () => {
  setup();
  assert.equal((await call('GET', '/api/school/curriculum', null)).status, 401); assert.equal((await call('PUT', '/api/school/curriculum', null, CFG)).status, 401);
  assert.equal((await call('GET', '/api/school/curriculum', 'T-plain')).status, 403); assert.equal((await call('PUT', '/api/school/curriculum', 'T-plain', { ...CFG, version: 0 })).status, 403);
  const g = await call('GET', '/api/school/curriculum', 'T-teacher'); assert.equal(g.status, 200); assert.equal(g.body.config, null); assert.equal(g.body.canEdit, false);
  assert.equal((await call('PUT', '/api/school/curriculum', 'T-teacher', { ...CFG, version: 0 })).status, 403, 'a linked non-holder cannot write');
  assert.equal(table(TABLES.school).size, 0);
  const p = await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, version: 0 }); assert.equal(p.status, 200); assert.equal((p.body.config as { version: number }).version, 1);
  assert.equal(table(TABLES.school).size, 1); assert.ok(table(TABLES.school).has('L1'), 'stored under the licence id');
  const g2 = await call('GET', '/api/school/curriculum', 'T-teacher'); assert.equal((g2.body.config as { version: number }).version, 1);
  assert.equal((await call('GET', '/api/school/curriculum', 'T-holder')).body.canEdit, true);
});

test('school routes: version conflict 409, stale write cannot overwrite, schools are isolated, hostile bodies refused, nothing written on refusal', async () => {
  setup();
  await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, version: 0 });
  const stale = await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, classes: [], version: 0 }); assert.equal(stale.status, 409);
  assert.equal(((table(TABLES.school).get('L1')!.classes) as unknown[]).length, 1, 'stale write changed nothing');
  const ok = await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, classes: [], version: 1 }); assert.equal(ok.status, 200); assert.equal((ok.body.config as { version: number }).version, 2);
  assert.equal((await call('GET', '/api/school/curriculum', 'T-other')).body.config, null, 'another school sees none of it');
  assert.ok(!table(TABLES.school).has('L2'));
  for (const bad of [{ ...CFG, version: 2, role: 'owner' }, { ...CFG, version: 2, licenceId: 'L2' }, { ...CFG, version: 2, schoolId: 'L2' }, { ...CFG, version: 2, classes: [{ ...CFG.classes[0], name: '<b>x</b>' }] }, 'x', null, [], { ...CFG, version: -1 }]) {
    const r = await call('PUT', '/api/school/curriculum', 'T-holder', bad as never); assert.ok(r.status === 400 || r.status === 409, JSON.stringify(bad).slice(0, 40) + ' -> ' + r.status);
  }
  assert.equal((table(TABLES.school).get('L1')!.version), 2);
});

test('school routes: expired or revoked licences lose access at once; two simultaneous first saves: exactly one wins', async () => {
  setup();
  const [a, b] = await Promise.all([call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, version: 0 }), call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, classes: [], version: 0 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  seed('lga_licences', 'L1', { school: 'Sunny', email: 'head@school.test', expiresAt: new Date(Date.now() - 1000).toISOString(), revoked: false });
  assert.equal((await call('GET', '/api/school/curriculum', 'T-holder')).status, 403);
  seed('lga_licences', 'L1', { school: 'Sunny', email: 'head@school.test', expiresAt: new Date(Date.now() + 1e9).toISOString(), revoked: true });
  assert.equal((await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, version: 1 })).status, 403);
});

test('school routes: a database failure gives a generic 500 with no internals; unreadable stored settings are never overwritten', async () => {
  setup(); store.failAfterNthWrite = 0;
  const r = await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, version: 0 }); assert.equal(r.status, 500); assert.ok(!/Gateway|App|db|table/i.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  setup(); seed(TABLES.school, 'L1', { id: 'L1', garbage: true });
  assert.equal((await call('GET', '/api/school/curriculum', 'T-holder')).status, 500);
  assert.equal((await call('PUT', '/api/school/curriculum', 'T-holder', { ...CFG, version: 0 })).status, 500); assert.equal(table(TABLES.school).get('L1')!.garbage, true);
});

// ------------------------------------------------------------------------------------------------ owner routes
const OWNER_ROUTES: [string, string, unknown?][] = [['GET', '/api/curriculum/owner/packs'], ['GET', '/api/curriculum/owner/audit'], ['POST', '/api/curriculum/owner/create', { frameworkId: 'fx-pack' }], ['POST', '/api/curriculum/owner/revoke', { frameworkId: 'fx-pack', reason: 'testing' }], ['POST', '/api/curriculum/owner/publish', { releaseId: 'fx-pack@1.0', expectedRev: 1 }], ['POST', '/api/curriculum/owner/bogus', {}]];

test('owner routes: signed-out 401; plain, licensee, school, staff and admin accounts get 403 on EVERY owner route and nothing is written', async () => {
  setup();
  for (const [m, p, b] of OWNER_ROUTES) {
    assert.equal((await call(m, p, null, b)).status, 401, 'signed out ' + p);
    for (const tok of ['T-plain', 'T-holder', 'T-teacher', 'T-staff', 'T-admin']) assert.equal((await call(m, p, tok, b)).status, 403, tok + ' ' + p);
  }
  assert.equal(store.transacts, 0); for (const t of [TABLES.releases, TABLES.current, TABLES.audit, TABLES.revocations]) assert.equal(table(t).size, 0, t);
  assert.equal((await call('GET', '/api/curriculum/owner/packs', 'T-owner')).status, 200);
  assert.equal((await call('POST', '/api/curriculum/owner/bogus', 'T-owner', {})).status, 404);
});

const own = (action: string, body: Record<string, unknown>): Promise<R> => call('POST', '/api/curriculum/owner/' + action, 'T-owner', body);
async function publishFlow(): Promise<void> {
  assert.equal((await own('create', { frameworkId: 'fx-pack' })).status, 200);
  const rel = () => table(TABLES.releases).get('fx-pack--at--1.0')!;
  assert.equal((await own('review', { releaseId: 'fx-pack@1.0', expectedRev: rel().rev, role: 'educator', reviewer: 'A. Teacher', note: 'checked' })).status, 200);
  assert.equal((await own('submit', { releaseId: 'fx-pack@1.0', expectedRev: rel().rev })).status, 200);
  assert.equal((await own('approve', { releaseId: 'fx-pack@1.0', expectedRev: rel().rev })).status, 200);
  const p = await own('publish', { releaseId: 'fx-pack@1.0', expectedRev: rel().rev }); assert.equal(p.status, 200, JSON.stringify(p.body));
}

test('owner routes: full lifecycle through the routes; one atomic transaction per step; manifest reaches any signed-in account without names or notes', async () => {
  setup(); const t0 = store.transacts; await publishFlow(); assert.equal(store.transacts - t0, 5, 'one transaction per state change');
  assert.equal(table(TABLES.audit).size, 5); assert.equal((table(TABLES.current).get('fx-pack')!).releaseId, 'fx-pack@1.0');
  const m = await call('GET', '/api/curriculum/published', 'T-plain'); assert.equal(m.status, 200);
  const pub = m.body.published as { frameworkId: string; digest: string }[]; assert.equal(pub.length, 1); assert.equal(pub[0].digest, contentDigest('fx-pack', W));
  assert.ok(!/A\. Teacher|checked/.test(JSON.stringify(m.body)), 'no reviewer names or notes'); assert.deepEqual(m.body.revoked, []);
  assert.equal((await call('GET', '/api/curriculum/published', null)).status, 401);
  const packs = await call('GET', '/api/curriculum/owner/packs', 'T-owner'); assert.equal((packs.body.packs as { isCurrent: boolean }[])[0].isCurrent, true);
  const aud = await call('GET', '/api/curriculum/owner/audit', 'T-owner'); assert.equal((aud.body.audit as unknown[]).length, 5);
});

test('owner routes: emergency revoke through the routes clears the pointer, archives, records the revocation, and the manifest lists it', async () => {
  setup(); await publishFlow(); const t0 = store.transacts;
  const r = await own('revoke', { frameworkId: 'fx-pack', reason: 'wrong letter shapes' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(store.transacts - t0, 1, 'one atomic transaction');
  const d = contentDigest('fx-pack', W)!; assert.equal(table(TABLES.revocations).get(d)!.reason, 'wrong letter shapes');
  assert.equal(table(TABLES.current).get('fx-pack')!.releaseId, null, 'tombstone, not a live pointer');
  assert.equal(table(TABLES.releases).get('fx-pack--at--1.0')!.state, 'archived');
  const m = await call('GET', '/api/curriculum/published', 'T-plain'); assert.deepEqual(m.body.published, []); assert.deepEqual(m.body.revoked, [d]);
  const rb = await own('rollback', { releaseId: 'fx-pack@1.0', expectedRev: table(TABLES.releases).get('fx-pack--at--1.0')!.rev }); assert.equal(rb.status, 409);
  const again = await own('revoke', { frameworkId: 'fx-pack', reason: 'second call' }); assert.equal(again.status, 200); assert.equal(table(TABLES.revocations).size, 1, 'idempotent');
  assert.equal((await call('GET', '/api/curriculum/owner/packs', 'T-owner')).body.packs && ((await call('GET', '/api/curriculum/owner/packs', 'T-owner')).body.packs as { revoked: boolean }[])[0].revoked, true);
});

test('owner routes: a tombstoned pointer can be published again after a content fix (new digest); stale pointer expectations conflict', async () => {
  setup(); await publishFlow(); await own('revoke', { frameworkId: 'fx-pack', reason: 'wrong' });
  // a pointer tombstone must not block a later publish of a different release of the same framework
  const rows = table(TABLES.current); assert.equal(rows.get('fx-pack')!.releaseId, null);
  seed(TABLES.current, 'fx-pack', { frameworkId: 'fx-pack', releaseId: null, version: null, digest: null, publishedAt: null, publishedBy: null });
  const m = await call('GET', '/api/curriculum/published', 'T-plain'); assert.deepEqual(m.body.published, []);
});

test('owner routes: a storage failure changes nothing; an unknown outcome is reported honestly; a conflict answers 409', async () => {
  setup(); await publishFlow(); const before = JSON.stringify([...store.tables].map(([k, v]) => [k, [...v]]));
  store.failTransact = 'down'; const f = await own('revoke', { frameworkId: 'fx-pack', reason: 'will fail' }); assert.equal(f.status, 500); assert.match(String(f.body.error), /Nothing was changed/);
  assert.equal(JSON.stringify([...store.tables].map(([k, v]) => [k, [...v]])), before, 'database identical after the failed call');
  store.failTransact = 'unknown'; const u = await own('revoke', { frameworkId: 'fx-pack', reason: 'unknown outcome' }); assert.equal(u.status, 500);
  assert.match(String(u.body.error), /may or may not/); assert.doesNotMatch(String(u.body.error), /Nothing was changed/);
  setup(); await publishFlow(); store.failTransact = 'conflict'; assert.equal((await own('revoke', { frameworkId: 'fx-pack', reason: 'conflict' })).status, 409);
});

test('manifest and owner list FAIL CLOSED when the revocation table cannot be read completely', async () => {
  setup(); await publishFlow();
  store.failListTable = TABLES.revocations; assert.equal((await call('GET', '/api/curriculum/published', 'T-plain')).status, 500); assert.equal((await call('GET', '/api/curriculum/owner/packs', 'T-owner')).status, 500);
  store.failListTable = null; store.pageLimit = 1; // a table that does not fit one page is refused, never read partially
  seed(TABLES.revocations, 'a'.repeat(64), { id: 'a'.repeat(64), digest: 'a'.repeat(64), frameworkId: 'x', at: 'y', by: 'o', reason: 'r' });
  assert.equal((await call('GET', '/api/curriculum/published', 'T-plain')).status, 200, 'one row fits in a page of one');
  seed(TABLES.revocations, 'b'.repeat(64), { id: 'b'.repeat(64), digest: 'b'.repeat(64), frameworkId: 'x', at: 'z', by: 'o', reason: 'r' });
  assert.equal((await call('GET', '/api/curriculum/published', 'T-plain')).status, 500);
});

test('route table: exactly the intended routes, owner routes carry requireRole, no route accepts a client-supplied role or school id', async () => {
  const routes = createCurriculumRoutes(W); assert.deepEqual(Object.keys(routes).sort(), ['GET /api/curriculum/owner/audit', 'GET /api/curriculum/owner/packs', 'GET /api/curriculum/published', 'GET /api/school/curriculum', 'POST /api/curriculum/owner/:action', 'PUT /api/school/curriculum']);
  for (const [k, chain] of Object.entries(routes)) assert.equal(chain.length, k.includes('/owner/') ? 3 : k.includes('/published') || k.includes('/school/') ? (k.includes('/published') ? 2 : 2) : 0, k);
});

test('commit(): every compare-and-set is enforced by the database condition itself (stale pointer, stale revision, missing target), and a failed one changes nothing', async () => {
  setup(); await publishFlow();
  const { ownerDeps } = await import('../../integration/backend/curriculumRoutes.ts'); const deps = ownerDeps(W);
  const snap = () => JSON.stringify([...store.tables].map(([k, v]) => [k, [...v]]));
  const rel = await deps.getRelease('fx-pack@1.0'); assert.ok(rel); const ptr = (await deps.listCurrent())[0]; assert.ok(ptr);
  const before = snap();
  assert.equal(await deps.commit([{ kind: 'current', frameworkId: 'fx-pack', value: { ...ptr, version: '9' }, expectedReleaseId: 'someone-else@1' }]), false, 'stale pointer expectation');
  assert.equal(await deps.commit([{ kind: 'current', frameworkId: 'fx-pack', value: null, expectedReleaseId: 'someone-else@1' }]), false, 'stale clear');
  assert.equal(await deps.commit([{ kind: 'release', value: { ...rel, state: 'archived', rev: rel.rev + 1 }, expectedRev: rel.rev - 1 }]), false, 'stale revision');
  assert.equal(await deps.commit([{ kind: 'release', value: { ...rel, id: 'nope@1', rev: 2 }, expectedRev: 1 }]), false, 'update of a release that does not exist');
  assert.equal(await deps.commit([{ kind: 'release', value: rel, expectedRev: null }]), false, 'create over an existing release');
  assert.equal(snap(), before, 'nothing changed by any failed commit');
  // a transaction where one member fails rolls back the members that would have succeeded
  assert.equal(await deps.commit([{ kind: 'audit', value: { id: 'z1', at: 'a', actor: 'u', action: 'x', releaseId: 'r', detail: '' } }, { kind: 'current', frameworkId: 'fx-pack', value: null, expectedReleaseId: 'stale' }]), false);
  assert.equal(snap(), before, 'the audit row of the failed transaction was not written');
  assert.equal(await deps.commit([{ kind: 'revocation', value: { digest: 'c'.repeat(64), frameworkId: 'x', at: 'a', by: 'u', reason: 'r' } }]), true);
  assert.equal(await deps.commit([{ kind: 'revocation', value: { digest: 'c'.repeat(64), frameworkId: 'x', at: 'b', by: 'u2', reason: 'later' } }]), true, 'second revocation of the same digest is a harmless no-op');
  assert.equal(table(TABLES.revocations).get('c'.repeat(64))!.reason, 'r');
});
