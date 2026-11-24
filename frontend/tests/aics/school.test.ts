import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_DATA_KEYS, SCHOOL_DEFAULTS_CACHE_KEY, PROFILE_KEY, activateAccount, aicsWorlds, authorizeSchool, chooseClass, clearSchoolDefaultsCache,
  effectiveProfile, getSchoolCurriculum, putSchoolCurriculum, readSchoolDefaults, syncSchoolDefaults, validateSchoolConfig,
} from '../../src/aics/index.ts';
import type { Deps, LicenceRec, SchoolCurriculumConfig } from '../../src/aics/index.ts';
import { V48_GROUPS } from './fixtures/worlds-v48.ts';
import { MemStore, markPublished } from './helpers.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const goodInput = () => ({
  schema: 1, countryCode: 'PK', frameworkId: 'snc-ecce-2020', stages: ['A3', 'A4'], defaultStage: 'A4', languages: ['en', 'ur'],
  classes: [{ id: 'sunflower', name: 'Sunflower Class', stage: 'A3', frameworkId: null, languages: ['en'] }, { id: 'rose', name: 'Rose Class', stage: 'A4', frameworkId: null, languages: ['en', 'ur'] }],
});

test('config validation accepts a good config and normalises class names', () => {
  const v = validateSchoolConfig({ ...goodInput(), classes: [{ id: 'a', name: '  Moon  ', stage: 'A4', frameworkId: 'snc-ecce-2020', languages: ['en'] }] });
  assert.ok(v.ok && v.config.classes[0].name === 'Moon');
});

test('config validation rejects: unknown fields (roles, school/licence ids), tracked-only curricula, wrong country/language/age band, bad classes', () => {
  const bad = (patch: object | ((c: ReturnType<typeof goodInput>) => unknown), re?: RegExp): void => {
    const input = typeof patch === 'function' ? patch(goodInput()) : { ...goodInput(), ...patch };
    const v = validateSchoolConfig(input); assert.equal(v.ok, false, String(typeof patch === 'function' ? 'fn' : JSON.stringify(patch)).slice(0, 80));
    if (re && !v.ok) assert.ok(v.errors.some((e) => re.test(e)), v.errors.join());
  };
  bad({ role: 'admin' }, /unexpected field/); bad({ licenceId: 'x' }, /unexpected field/); bad({ schoolId: 'x' }, /unexpected field/); bad({ permissions: ['all'] }, /unexpected field/);
  bad({ schema: 2 }); bad({ countryCode: 'ZZ' }, /country/); bad({ countryCode: 'FR' });
  bad({ frameworkId: 'pk-nncp-2026' }, /curriculum/); bad({ frameworkId: 'pk-punjab-2027' }); bad({ frameworkId: 'eyfs-2026' }); bad({ frameworkId: 'uae-moe-kg-overlay' });
  bad({ languages: ['fr'] }, /languages/); bad({ languages: [] }); bad({ languages: ['en', 'en'] });
  bad({ stages: ['A9'] }); bad({ stages: [] }); bad({ defaultStage: 'A5' }, /default age band/);
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], stage: 'A5' }] }), /age band/);
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], languages: ['ar'] }] }));
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], languages: ['en', 'ur'] }], languages: ['en'] }));
  bad((c) => ({ ...c, classes: [c.classes[0], c.classes[0]] }), /duplicate/);
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], id: 'Bad Id' }] }), /class id/);
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], name: '<img src=x>' }] }), /class name/);
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], name: '' }] })); bad((c) => ({ ...c, classes: [{ ...c.classes[0], name: 'x'.repeat(41) }] }));
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], teacher: 'x' }] }), /unexpected class field/);
  bad((c) => ({ ...c, classes: [{ ...c.classes[0], frameworkId: 'pk-nncp-2026' }] }), /class curriculum/);
  bad((c) => ({ ...c, classes: Array.from({ length: 21 }, (_, i) => ({ ...c.classes[0], id: 'c' + i })) }), /too many/);
  bad({ version: -1 }); bad({ version: 1.5 });
  assert.equal(validateSchoolConfig(null).ok, false); assert.equal(validateSchoolConfig([]).ok, false);
});

// ------------------------------------------------------------- server logic with an in-memory "database" ------------------------------------------------
function world() {
  const licences = new Map<string, LicenceRec>([
    ['L1', { id: 'L1', email: 'head@school1.test', expiresAt: '2027-01-01T00:00:00Z', revoked: false }],
    ['L2', { id: 'L2', email: 'head@school2.test', expiresAt: '2027-01-01T00:00:00Z', revoked: false }],
    ['LX', { id: 'LX', email: 'old@school3.test', expiresAt: '2026-01-01T00:00:00Z', revoked: false }],
    ['LR', { id: 'LR', email: 'rev@school4.test', expiresAt: '2027-01-01T00:00:00Z', revoked: true }],
  ]);
  const links = new Map<string, string>([['head1', 'L1'], ['teacher1', 'L1'], ['head2', 'L2'], ['oldhead', 'LX'], ['revhead', 'LR']]); // demo/unlinked users have no entry
  const configs = new Map<string, SchoolCurriculumConfig>();
  const log: string[] = [];
  let failNextPut = false;
  const deps: Deps = {
    getEntitlement: async (u) => { const l = links.get(u); return l ? { licenceId: l } : null; },
    getLicence: async (id) => licences.get(id) ?? null,
    getConfig: async (id) => configs.get(id) ?? null,
    putConfig: async (id, c, expected) => {
      log.push('put:' + id);
      if (failNextPut) { failNextPut = false; return false; }
      if ((configs.get(id)?.version ?? null) !== expected) return false;
      configs.set(id, c); return true;
    },
    now: () => NOW,
  };
  return { deps, configs, log, failNext: () => { failNextPut = true; } };
}
const HEAD1 = { userId: 'head1', email: 'Head@School1.test' };

test('server: only a verified, active licence may read; demo, unlinked, expired, revoked and signed-out callers are refused', async () => {
  const w = world();
  assert.equal((await getSchoolCurriculum({}, w.deps)).ok, false);
  const codes: Record<string, number> = {};
  for (const u of ['', 'demo-user', 'oldhead', 'revhead']) { const r = await getSchoolCurriculum({ userId: u || undefined, email: 'x@y.z' }, w.deps); assert.equal(r.ok, false); if (!r.ok) codes[u] = r.status; }
  assert.deepEqual(codes, { '': 401, 'demo-user': 403, oldhead: 403, revhead: 403 });
  const ok = await getSchoolCurriculum(HEAD1, w.deps); assert.ok(ok.ok && ok.value.config === null && ok.value.canEdit && ok.value.licensedUntil === '2027-01-01T00:00:00Z');
});

test('server: only the verified licence-holder e-mail may write; other staff on the licence can read but not change (case-insensitive e-mail)', async () => {
  const w = world();
  const t = { userId: 'teacher1', email: 'teacher@school1.test' };
  const r = await getSchoolCurriculum(t, w.deps); assert.ok(r.ok && r.value.canEdit === false);
  const w1 = await putSchoolCurriculum(t, goodInput(), w.deps); assert.deepEqual([w1.ok, !w1.ok && w1.status], [false, 403]);
  assert.equal(w.log.length, 0, 'refused before anything was written');
  assert.deepEqual([(await putSchoolCurriculum({ userId: 'head1' }, goodInput(), w.deps)).ok], [false], 'no verified e-mail: no write');
  assert.ok((await putSchoolCurriculum(HEAD1, goodInput(), w.deps)).ok);
});

test('server: authorization happens before the body is examined, so an unauthorised caller learns nothing about validation', async () => {
  const w = world();
  const r = await putSchoolCurriculum({ userId: 'demo-user', email: 'x@y.z' }, { garbage: true }, w.deps);
  assert.deepEqual([r.ok, !r.ok && r.status], [false, 403]);
  const r2 = await putSchoolCurriculum(HEAD1, { ...goodInput(), licenceId: 'L2' }, w.deps);
  assert.deepEqual([r2.ok, !r2.ok && r2.status], [false, 400]);
});

test('server: each school is isolated; a client cannot target another school by sending its id', async () => {
  const w = world();
  const a = await putSchoolCurriculum(HEAD1, goodInput(), w.deps); assert.ok(a.ok);
  const other = { ...goodInput(), languages: ['en'], classes: [], defaultStage: 'A3', stages: ['A3'] };
  const b = await putSchoolCurriculum({ userId: 'head2', email: 'head@school2.test' }, other, w.deps); assert.ok(b.ok);
  assert.deepEqual([...w.configs.keys()].sort(), ['L1', 'L2']);
  assert.deepEqual(w.configs.get('L1')!.languages, ['en', 'ur']); assert.deepEqual(w.configs.get('L2')!.languages, ['en']);
  const read2 = await getSchoolCurriculum({ userId: 'head2', email: 'head@school2.test' }, w.deps); assert.ok(read2.ok && read2.value.config!.classes.length === 0);
  const read1 = await getSchoolCurriculum({ userId: 'teacher1', email: 't@school1.test' }, w.deps); assert.ok(read1.ok && read1.value.config!.classes.length === 2, 'staff of school 1 see school 1 only');
  const authz = await authorizeSchool({ userId: 'head2', email: 'head@school2.test' }, w.deps, 'write'); assert.ok(authz.ok && authz.value.licence.id === 'L2');
});

test('server: expiry and revocation stop writes at once; stored settings are kept for renewal', async () => {
  const w = world(); assert.ok((await putSchoolCurriculum(HEAD1, goodInput(), w.deps)).ok);
  const saved = JSON.stringify(w.configs.get('L1'));
  const lic = (await w.deps.getLicence('L1'))!; lic.revoked = true;
  const r = await putSchoolCurriculum(HEAD1, { ...goodInput(), version: 1 }, w.deps); assert.deepEqual([r.ok, !r.ok && r.status], [false, 403]);
  assert.equal((await getSchoolCurriculum(HEAD1, w.deps)).ok, false);
  assert.equal(JSON.stringify(w.configs.get('L1')), saved);
});

test('server: concurrent edits are not silently overwritten (version check and compare-and-set)', async () => {
  const w = world();
  const first = await putSchoolCurriculum(HEAD1, goodInput(), w.deps); assert.ok(first.ok && first.value.config.version === 1);
  const stale = await putSchoolCurriculum(HEAD1, { ...goodInput(), version: 0 }, w.deps); assert.deepEqual([stale.ok, !stale.ok && stale.status], [false, 409]);
  w.failNext(); const lost = await putSchoolCurriculum(HEAD1, { ...goodInput(), version: 1 }, w.deps); assert.deepEqual([lost.ok, !lost.ok && lost.status], [false, 409]);
  const second = await putSchoolCurriculum(HEAD1, { ...goodInput(), version: 1, defaultStage: 'A3' }, w.deps); assert.ok(second.ok && second.value.config.version === 2 && second.value.config.updatedAt === new Date(NOW).toISOString());
});

// ------------------------------------------------------------------ client cache and resolution --------------------------------------------------------
const serverView = async (w = world()) => {
  const put = await putSchoolCurriculum(HEAD1, goodInput(), w.deps); assert.ok(put.ok);
  const r = await getSchoolCurriculum({ userId: 'teacher1', email: 't@school1.test' }, w.deps); assert.ok(r.ok);
  return r.value;
};

test('client: defaults are cached only for a licensed account, validated, and cleared on any doubt', async () => {
  const view = await serverView(); const s = new MemStore();
  const api = { get: async () => ({ data: view }) };
  assert.equal(await syncSchoolDefaults(api, s, 'demo', () => NOW), 'cleared'); assert.equal(readSchoolDefaults(s, () => NOW), null);
  assert.equal(await syncSchoolDefaults(api, s, 'licensed', () => NOW), 'applied'); assert.ok(readSchoolDefaults(s, () => NOW));
  assert.equal(await syncSchoolDefaults({ get: async () => { throw new Error('403'); } }, s, 'licensed', () => NOW), 'cleared'); assert.equal(readSchoolDefaults(s, () => NOW), null);
  await syncSchoolDefaults(api, s, 'licensed', () => NOW);
  assert.equal(await syncSchoolDefaults(api, s, 'expired', () => NOW), 'cleared'); assert.equal(s.data.has(SCHOOL_DEFAULTS_CACHE_KEY), false);
  assert.equal(await syncSchoolDefaults({ get: async () => ({ data: { ...view, licensedUntil: '2026-01-01T00:00:00Z' } }) }, s, 'licensed', () => NOW), 'cleared');
  assert.equal(await syncSchoolDefaults({ get: async () => ({ data: { ...view, config: { ...view.config, role: 'admin' } } }) }, s, 'licensed', () => NOW), 'error');
  assert.equal(await syncSchoolDefaults({ get: async () => ({ data: { ...view, config: null } }) }, s, 'licensed', () => NOW), 'none');
  assert.equal(await syncSchoolDefaults(api, null, 'licensed'), 'error');
});

test('client: a tampered or expired cache is ignored; the licence end date stops school defaults without any request', async () => {
  const view = await serverView(); const s = new MemStore();
  await syncSchoolDefaults({ get: async () => ({ data: view }) }, s, 'licensed', () => NOW);
  assert.ok(readSchoolDefaults(s, () => NOW)); assert.equal(readSchoolDefaults(s, () => Date.parse('2027-02-01T00:00:00Z')), null);
  const c = JSON.parse(s.data.get(SCHOOL_DEFAULTS_CACHE_KEY)!); c.config.frameworkId = 'pk-nncp-2026'; s.data.set(SCHOOL_DEFAULTS_CACHE_KEY, JSON.stringify(c));
  assert.equal(readSchoolDefaults(s, () => NOW), null);
  s.data.set(SCHOOL_DEFAULTS_CACHE_KEY, 'junk'); assert.equal(readSchoolDefaults(s, () => NOW), null);
});

test('resolution: the adult\'s own completed choice always wins; school defaults fill in only when there is none; classes refine; licence end reverts', async () => {
  const view = await serverView(); const s = new MemStore();
  assert.equal(effectiveProfile(s, () => NOW), null);
  await syncSchoolDefaults({ get: async () => ({ data: view }) }, s, 'licensed', () => NOW);
  const p = effectiveProfile(s, () => NOW)!;
  assert.deepEqual([p.status, p.setting, p.countryCode, p.frameworkId, p.stage, p.languages], ['completed', 'school', 'PK', 'snc-ecce-2020', 'A4', ['en', 'ur']]);
  assert.ok(chooseClass(s, 'sunflower', () => NOW)); const c = effectiveProfile(s, () => NOW)!; assert.deepEqual([c.stage, c.languages], ['A3', ['en']]);
  assert.equal(chooseClass(s, 'nope', () => NOW), false); assert.equal(chooseClass(null, 'rose'), false);
  assert.ok(chooseClass(s, null, () => NOW)); assert.equal(effectiveProfile(s, () => NOW)!.stage, 'A4');
  s.data.set(PROFILE_KEY, JSON.stringify({ schema: 1, status: 'completed', updatedAt: '2026-11-22T00:00:00.000Z', setting: 'home', countryCode: 'INTL', frameworkId: 'intl-core', stage: 'A5', languages: ['en'], modules: [] }));
  assert.equal(effectiveProfile(s, () => NOW)!.countryCode, 'INTL', 'own choice wins');
  s.data.set(PROFILE_KEY, JSON.stringify({ schema: 1, status: 'skipped', updatedAt: '2026-11-22T00:00:00.000Z', setting: 'home', countryCode: 'INTL', frameworkId: 'intl-core', stage: 'mixed', languages: ['en'], modules: [] }));
  assert.equal(effectiveProfile(s, () => NOW)!.countryCode, 'PK', 'a skipped choice does not block school defaults');
  clearSchoolDefaultsCache(s); assert.equal(effectiveProfile(s, () => NOW)!.status, 'skipped');
  assert.deepEqual(chooseClass(s, 'rose'), false);
});

test('Learning Worlds use school defaults for a licensed account, and show the original screens without them', async () => {
  const view = await serverView(); const s = new MemStore();
  assert.strictEqual(aicsWorlds(V48_GROUPS, s).groups, V48_GROUPS);
  await syncSchoolDefaults({ get: async () => ({ data: view }) }, s, 'licensed', () => Date.now() - 0);
  // the cache above used the real clock for expiry checks inside aicsWorlds, so build one that is valid now
  const live = { ...view, licensedUntil: new Date(Date.now() + 86_400_000).toISOString() };
  await syncSchoolDefaults({ get: async () => ({ data: live }) }, s, 'licensed');
  assert.strictEqual(aicsWorlds(V48_GROUPS, s).groups, V48_GROUPS, 'unpublished packs never personalise, even for a licensed school');
  markPublished(s); const plan = aicsWorlds(V48_GROUPS, s); assert.equal(plan.personalised, true);
  const math = (plan.groups as readonly (readonly unknown[])[]).find((g) => g[0] === 'math')!; assert.equal(math[1], 'Maths & Thinking');
});

test('isolation: one account\'s school defaults and class choice never reach another account on the same browser', async () => {
  assert.ok(ACCOUNT_DATA_KEYS.includes(SCHOOL_DEFAULTS_CACHE_KEY));
  const view = await serverView(); const s = new MemStore();
  await activateAccount(s, 'head1'); await syncSchoolDefaults({ get: async () => ({ data: view }) }, s, 'licensed', () => NOW);
  assert.ok(readSchoolDefaults(s, () => NOW));
  await activateAccount(s, 'someone-else'); assert.equal(readSchoolDefaults(s, () => NOW), null); assert.equal(effectiveProfile(s, () => NOW), null);
  await activateAccount(s, 'head1'); assert.ok(readSchoolDefaults(s, () => NOW));
});
