import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  AICS_KEYS, FRAMEWORKS, LEGACY_KEYS, MAPPINGS, detectLegacyStorage, readProgressDoc, rollbackMigration, validateRegistries,
} from '../../src/aics/index.ts';
import {
  KILL_SWITCH_KEY, _resetBootstrapForTests, getLastBootstrapResult, runAicsBootstrap, safeLocalStorage, scheduleAicsBootstrap,
} from '../../src/aics/bootstrap.ts';
import { FIXED_NOW, MemStore, legacyRaw, legacyStore } from './helpers.ts';

const run = (s: MemStore | null) => runAicsBootstrap(s, { now: FIXED_NOW });

// ---------- detection ----------
test('detection: valid, empty, corrupt-only and mixed storage', () => {
  assert.equal(detectLegacyStorage(legacyStore()).valid, true);
  assert.equal(detectLegacyStorage(new MemStore()).valid, false);
  const corrupt = new MemStore();
  corrupt.data.set(LEGACY_KEYS.abc, '{oops');
  corrupt.data.set(LEGACY_KEYS.lost, '[1]');
  const d = detectLegacyStorage(corrupt);
  assert.equal(d.valid, false);
  assert.deepEqual(d.present.sort(), [LEGACY_KEYS.abc, LEGACY_KEYS.lost].sort());
  const mixed = new MemStore();
  mixed.data.set(LEGACY_KEYS.abc, '{oops');
  mixed.data.set(LEGACY_KEYS.quests, '{"q":true}');
  assert.deepEqual(detectLegacyStorage(mixed).usable, [LEGACY_KEYS.quests]);
});

test('detection ignores non-progress keys (language, theme, sound)', () => {
  const s = new MemStore();
  s.data.set('littleGeniusLanguage', 'ur');
  s.data.set('littleGeniusTheme', 'space');
  assert.equal(detectLegacyStorage(s).valid, false);
});

// ---------- first run ----------
test('first run with valid storage migrates and leaves every legacy key byte-identical', () => {
  const s = legacyStore();
  const before = legacyRaw(s);
  assert.equal(run(s).status, 'migrated');
  assert.equal(legacyRaw(s), before);
  assert.deepEqual(s.removes, [], 'nothing may be removed during a normal first run');
  assert.deepEqual([...new Set(s.writes)].sort(), [AICS_KEYS.flag, AICS_KEYS.progress].sort());
  assert.equal(s.data.get(AICS_KEYS.flag), '1');
  assert.ok(readProgressDoc(s));
});

test('first run for a brand-new child with no storage writes nothing and sets no flag', () => {
  const s = new MemStore();
  assert.equal(run(s).status, 'no-valid-legacy-data');
  assert.deepEqual(s.writes, []);
  assert.deepEqual(s.removes, []);
  assert.equal(s.data.size, 0);
});

test('only-corrupt legacy data: no migration, nothing written, corrupt value left as is', () => {
  const s = new MemStore();
  s.data.set(LEGACY_KEYS.curriculum, '{"records":');
  const r = run(s);
  assert.equal(r.status, 'no-valid-legacy-data');
  assert.ok(r.detail && r.detail.includes('not valid JSON'));
  assert.deepEqual(s.writes, []);
  assert.equal(s.data.get(LEGACY_KEYS.curriculum), '{"records":');
});

test('mixed corrupt and valid legacy data migrates the valid parts and records the issue', () => {
  const s = new MemStore();
  s.data.set(LEGACY_KEYS.abc, '{oops');
  s.data.set(LEGACY_KEYS.lost, JSON.stringify({ completed: { A: true } }));
  assert.equal(run(s).status, 'migrated');
  const doc = readProgressDoc(s)!;
  assert.ok(doc.activities['act.lit.lost-letters']['letter:A']);
  assert.ok(doc.issues.some((i) => i.includes(LEGACY_KEYS.abc)));
  assert.equal(s.data.get(LEGACY_KEYS.abc), '{oops');
});

// ---------- repeated run ----------
test('repeated run is a no-op: same result, zero writes, document untouched', () => {
  const s = legacyStore();
  run(s);
  const doc = s.data.get(AICS_KEYS.progress);
  s.resetCounters();
  for (let i = 0; i < 3; i++) assert.equal(run(s).status, 'already-migrated');
  assert.deepEqual(s.writes, []);
  assert.deepEqual(s.removes, []);
  assert.equal(s.data.get(AICS_KEYS.progress), doc);
});

test('new progress after migration never alters the stored legacy keys and re-run does not overwrite the snapshot', () => {
  const s = legacyStore();
  run(s);
  s.data.set(LEGACY_KEYS.abc, JSON.stringify({ A: true, B: true, C: true })); // child keeps learning
  const afterPlay = legacyRaw(s);
  s.resetCounters();
  assert.equal(run(s).status, 'already-migrated');
  assert.equal(legacyRaw(s), afterPlay);
  assert.deepEqual(s.writes, []);
});

// ---------- interrupted / recoverable ----------
test('flag write fails (interrupted after document): failed, no half-state left, legacy intact, next run succeeds', () => {
  const s = legacyStore();
  const before = legacyRaw(s);
  s.failWriteNumber = 2; // 1st write = document, 2nd = flag
  const r = run(s);
  assert.equal(r.status, 'failed');
  assert.equal(s.data.has(AICS_KEYS.flag), false);
  assert.equal(s.data.has(AICS_KEYS.progress), false, 'partial document must be cleaned up');
  assert.equal(legacyRaw(s), before);
  assert.equal(run(s).status, 'migrated');
  assert.equal(s.data.get(AICS_KEYS.flag), '1');
});

test('interrupted and cleanup also blocked: still no throw; leftover document is repaired on next run', () => {
  const s = legacyStore();
  const before = legacyRaw(s);
  s.failWriteNumber = 2;
  s.failRemoves = true;
  assert.equal(run(s).status, 'failed');
  assert.equal(s.data.has(AICS_KEYS.progress), true, 'leftover document without flag');
  assert.equal(s.data.has(AICS_KEYS.flag), false);
  s.failRemoves = false;
  assert.equal(run(s).status, 'migrated');
  assert.equal(legacyRaw(s), before);
  assert.ok(readProgressDoc(s));
});

test('flag present but document missing is repaired automatically', () => {
  const s = legacyStore();
  run(s);
  s.data.delete(AICS_KEYS.progress);
  assert.equal(run(s).status, 'repaired');
  assert.ok(readProgressDoc(s));
});

test('flag present and document corrupt is repaired automatically', () => {
  const s = legacyStore();
  run(s);
  s.data.set(AICS_KEYS.progress, '{broken');
  assert.equal(run(s).status, 'repaired');
  assert.equal(readProgressDoc(s)!.schema, 1);
});

// ---------- storage full / blocked ----------
test('storage full from the first write: failed, nothing changed, no AICS keys, legacy intact', () => {
  const s = legacyStore();
  const before = legacyRaw(s);
  s.failAllWrites = true;
  const r = run(s);
  assert.equal(r.status, 'failed');
  assert.ok(r.detail && r.detail.includes('QuotaExceededError'));
  assert.equal(legacyRaw(s), before);
  assert.equal(s.data.has(AICS_KEYS.progress), false);
  assert.equal(s.data.has(AICS_KEYS.flag), false);
});

test('blocked storage (reads throw) never throws out of the bootstrap', () => {
  const s = legacyStore();
  s.throwOnGet = true;
  assert.equal(run(s).status, 'failed');
  assert.equal(run(null).status, 'storage-unavailable');
});

test('safeLocalStorage returns null when the browser blocks access', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.equal(safeLocalStorage(), null);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete (globalThis as Record<string, unknown>).localStorage;
  }
});

// ---------- safety nets ----------
test('if migration ever modified a legacy value it is detected and rolled back', () => {
  const s = legacyStore();
  s.onSet = (k, _v, store) => { if (k === AICS_KEYS.progress) store.data.set(LEGACY_KEYS.abc, '{"A":false}'); };
  const r = run(s);
  assert.equal(r.status, 'failed');
  assert.ok(r.detail && r.detail.includes('legacy values changed'));
  assert.equal(s.data.has(AICS_KEYS.progress), false);
  assert.equal(s.data.has(AICS_KEYS.flag), false);
});

test('kill switch disables migration with zero writes', () => {
  const s = legacyStore();
  s.data.set(KILL_SWITCH_KEY, '1');
  assert.equal(run(s).status, 'disabled');
  assert.deepEqual(s.writes, []);
});

// ---------- rollback ----------
test('rollback removes only AICS keys, restores pre-migration storage exactly, and can be re-migrated', () => {
  const s = legacyStore();
  const pristine = JSON.stringify([...s.data.entries()].sort());
  run(s);
  assert.notEqual(JSON.stringify([...s.data.entries()].sort()), pristine);
  const r = rollbackMigration(s);
  assert.deepEqual(r.errors, []);
  assert.equal(JSON.stringify([...s.data.entries()].sort()), pristine, 'storage must equal its pre-migration state');
  assert.equal(run(s).status, 'migrated');
});

test('rollback never throws even if removal is blocked', () => {
  const s = legacyStore();
  run(s);
  s.failRemoves = true;
  const r = rollbackMigration(s);
  assert.equal(r.removed.length, 0);
  assert.equal(r.errors.length, 2);
});

// ---------- scheduling / integration ----------
test('scheduleAicsBootstrap defers work, runs once, and records the result', () => {
  _resetBootstrapForTests();
  const s = legacyStore();
  const queued: Array<() => void> = [];
  const delays: number[] = [];
  const first = scheduleAicsBootstrap({ storage: s, schedule: (fn, ms) => { queued.push(fn); delays.push(ms); } });
  const second = scheduleAicsBootstrap({ storage: s, schedule: (fn) => queued.push(fn) });
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(queued.length, 1);
  assert.ok(delays[0] >= 1000, 'must be deferred past first paint');
  assert.deepEqual(s.writes, [], 'nothing runs synchronously at mount');
  queued[0]();
  assert.equal(getLastBootstrapResult()?.status, 'migrated');
});

test('a scheduler that throws is swallowed', () => {
  _resetBootstrapForTests();
  assert.doesNotThrow(() => scheduleAicsBootstrap({ storage: legacyStore(), schedule: () => { throw new Error('no timers'); } }));
  assert.equal(getLastBootstrapResult()?.status, 'failed');
});

test('integration: dynamic import path used by the app hook resolves and runs against a browser-like localStorage', async () => {
  _resetBootstrapForTests();
  const s = legacyStore();
  (globalThis as Record<string, unknown>).localStorage = s;
  try {
    const m = await import('../../src/aics/bootstrap.ts'); // same specifier shape as './aics/bootstrap' in learningApp.ts
    const timers: Array<() => void> = [];
    m.scheduleAicsBootstrap({ schedule: (fn) => timers.push(fn) }); // storage resolved from globalThis.localStorage
    timers[0]();
    assert.equal(m.getLastBootstrapResult()?.status, 'migrated');
    assert.ok(readProgressDoc(s));
  } finally {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
});

test('integration diff touches only mountLearningApp and none of the protected areas', () => {
  const diff = readFileSync(new URL('./fixtures/learningApp.diff', import.meta.url), 'utf8');
  const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  assert.equal(removed.length, 1);
  assert.equal(added.length, 2);
  assert.ok(removed[0].includes('export function mountLearningApp'));
  assert.ok(added[1].includes('export function mountLearningApp') && added[1].includes('render();startAicsMigration();'));
  for (const line of added) {
    for (const banned of ['header', 'nav', 'auth', 'licen', 'school', 'library', 'worlds', 'data-tab']) {
      assert.ok(!line.toLowerCase().includes(banned), 'added line mentions protected area: ' + banned);
    }
  }
  assert.ok(existsSync(new URL('../../src/aics/bootstrap.ts', import.meta.url)), 'hook import target must exist');
  assert.ok(added[0].includes("import('./aics/bootstrap')") && added[0].includes('.catch('));
});

test('migration never publishes or promotes any curriculum content', () => {
  const s = legacyStore();
  run(s);
  assert.ok(FRAMEWORKS.every((f) => f.status === 'draft'));
  assert.ok(MAPPINGS.every((m) => m.status === 'draft' || m.status === 'pending-source'));
  assert.deepEqual(validateRegistries(), []);
  const text = s.data.get(AICS_KEYS.progress)!;
  assert.ok(!/published|approved/i.test(text));
});
