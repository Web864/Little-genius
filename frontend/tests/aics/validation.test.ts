import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AICS_KEYS, LEGACY_KEYS, buildProgressDoc, inspectProgressDoc, readProgressDoc, validateProgressDoc,
} from '../../src/aics/index.ts';
import { runAicsBootstrap } from '../../src/aics/bootstrap.ts';
import { FIXED_NOW, MemStore, legacyRaw, legacyStore } from './helpers.ts';

const goodDoc = () => JSON.parse(JSON.stringify(buildProgressDoc(legacyStore(), FIXED_NOW())));
const run = (s: MemStore) => runAicsBootstrap(s, { now: FIXED_NOW });

test('a freshly built document from realistic legacy data passes strict validation', () => {
  const r = validateProgressDoc(goodDoc());
  assert.equal(r.ok, true);
});

test('an empty migrated document is valid', () => {
  assert.equal(validateProgressDoc(buildProgressDoc(new MemStore(), FIXED_NOW())).ok, true);
});

const mutate = (name: string, fn: (d: any) => void, reasonPart: string) =>
  test('rejects: ' + name, () => {
    const d = goodDoc();
    fn(d);
    const r = validateProgressDoc(d);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.reason.includes(reasonPart), r.reason);
  });

mutate('extra top-level field', (d) => { d.childName = 'x'; }, 'unexpected field');
mutate('bad migratedAt type', (d) => { d.migratedAt = 5; }, 'migratedAt');
mutate('bad migratedAt string', (d) => { d.migratedAt = 'not a date'; }, 'migratedAt');
mutate('legacyKeysSeen not array', (d) => { d.legacyKeysSeen = 'x'; }, 'legacyKeysSeen');
mutate('legacyKeysSeen unknown key', (d) => { d.legacyKeysSeen = ['otherApp']; }, 'legacyKeysSeen');
mutate('skipped negative', (d) => { d.skipped = -1; }, 'skipped');
mutate('skipped fractional', (d) => { d.skipped = 1.5; }, 'skipped');
mutate('issues contain non-string', (d) => { d.issues = [1]; }, 'issues');
mutate('activities is array', (d) => { d.activities = []; }, 'activities');
mutate('unknown activity id', (d) => { d.activities['act.fake'] = {}; }, 'unknown activity');
mutate('activity is not an object', (d) => { d.activities['act.lit.abc'] = 3; }, 'not an object');
mutate('item key invalid for letters', (d) => { d.activities['act.lit.abc']['letter:1'] = { completed: true }; }, 'invalid item key');
mutate('item key lowercase letter', (d) => { d.activities['act.lit.abc']['letter:a'] = { completed: true }; }, 'invalid item key');
mutate('world index out of range', (d) => { d.activities['act.lit.sounds']['phonics:99'] = { ok: 1 }; }, 'invalid item key');
mutate('world item under wrong activity', (d) => { d.activities['act.lit.sounds']['urdu:1'] = { ok: 1 }; }, 'invalid item key');
mutate('quest key without prefix', (d) => { d.activities['act.pat.quests']['forest'] = { completed: true }; }, 'invalid item key');
mutate('item not an object', (d) => { d.activities['act.lit.abc']['letter:A'] = true; }, 'not an object');
mutate('item unexpected field', (d) => { d.activities['act.lit.abc']['letter:A'].name = 'x'; }, 'unexpected item field');
mutate('completed not boolean', (d) => { d.activities['act.lit.abc']['letter:A'].completed = 'yes'; }, 'completed');
mutate('ok is a string', (d) => { d.activities['act.lit.sounds']['phonics:0'].ok = '2'; }, 'ok');
mutate('wrong negative', (d) => { d.activities['act.lit.sounds']['phonics:0'].wrong = -1; }, 'wrong');
mutate('tries NaN-like (null)', (d) => { d.activities['act.lit.sounds']['phonics:0'].tries = null; }, 'tries');
mutate('due bad format', (d) => { d.activities['act.lit.sounds']['phonics:0'].due = '25/11/2026'; }, 'due');
mutate('due impossible date', (d) => { d.activities['act.lit.sounds']['phonics:0'].due = '2026-13-45'; }, 'due');

test('rejects non-object roots', () => {
  for (const v of [null, undefined, 1, 'x', [], true]) assert.equal(validateProgressDoc(v).ok, false);
});

test('inspectProgressDoc distinguishes missing, valid, invalid JSON, invalid shape and newer version', () => {
  const s = new MemStore();
  assert.equal(inspectProgressDoc(s).state, 'missing');
  s.data.set(AICS_KEYS.progress, '{oops');
  assert.equal(inspectProgressDoc(s).state, 'invalid');
  s.data.set(AICS_KEYS.progress, JSON.stringify({ schema: 1 }));
  assert.equal(inspectProgressDoc(s).state, 'invalid');
  s.data.set(AICS_KEYS.progress, JSON.stringify({ ...goodDoc(), schema: 2 }));
  assert.equal(inspectProgressDoc(s).state, 'version-mismatch');
  s.data.set(AICS_KEYS.progress, JSON.stringify({ ...goodDoc(), schema: 0 }));
  assert.equal(inspectProgressDoc(s).state, 'invalid'); // older/unknown: repairable
  s.data.set(AICS_KEYS.progress, JSON.stringify(goodDoc()));
  assert.equal(inspectProgressDoc(s).state, 'valid');
  assert.ok(readProgressDoc(s));
});

// ---------- recovery behaviour ----------
test('recovery: flagged but partially valid document is repaired from legacy data', () => {
  const s = legacyStore();
  const legacyBefore = legacyRaw(s);
  assert.equal(run(s).status, 'migrated');
  const d = JSON.parse(s.data.get(AICS_KEYS.progress)!);
  d.activities['act.lit.abc']['letter:A'].completed = 'maybe'; // one bad field
  s.data.set(AICS_KEYS.progress, JSON.stringify(d));
  assert.equal(run(s).status, 'repaired');
  assert.equal(validateProgressDoc(JSON.parse(s.data.get(AICS_KEYS.progress)!)).ok, true);
  assert.equal(legacyRaw(s), legacyBefore);
});

test('recovery: flagged with truncated JSON is repaired', () => {
  const s = legacyStore();
  run(s);
  s.data.set(AICS_KEYS.progress, s.data.get(AICS_KEYS.progress)!.slice(0, 40));
  assert.equal(run(s).status, 'repaired');
  assert.ok(readProgressDoc(s));
});

test('recovery: flagged but document missing is repaired', () => {
  const s = legacyStore();
  run(s);
  s.data.delete(AICS_KEYS.progress);
  assert.equal(run(s).status, 'repaired');
});

test('recovery: valid document but flag missing re-runs and ends flagged and valid', () => {
  const s = legacyStore();
  run(s);
  s.data.delete(AICS_KEYS.flag);
  assert.equal(run(s).status, 'migrated');
  assert.equal(s.data.get(AICS_KEYS.flag), '1');
  assert.ok(readProgressDoc(s));
});

test('version mismatch: a newer-schema document is never overwritten or removed', () => {
  const s = legacyStore();
  const newer = JSON.stringify({ schema: 2, somethingNew: true });
  s.data.set(AICS_KEYS.progress, newer);
  s.data.set(AICS_KEYS.flag, '1');
  s.resetCounters();
  assert.equal(run(s).status, 'version-mismatch');
  assert.equal(s.data.get(AICS_KEYS.progress), newer);
  assert.deepEqual(s.writes, []);
  assert.deepEqual(s.removes, []);
});

test('version mismatch without flag also leaves the newer document alone', () => {
  const s = legacyStore();
  const newer = JSON.stringify({ schema: 3 });
  s.data.set(AICS_KEYS.progress, newer);
  assert.equal(run(s).status, 'version-mismatch');
  assert.equal(s.data.get(AICS_KEYS.progress), newer);
  assert.equal(s.data.get(AICS_KEYS.flag) ?? null, null);
});

test('older/unknown schema document is treated as invalid and repaired', () => {
  const s = legacyStore();
  s.data.set(AICS_KEYS.progress, JSON.stringify({ schema: 0, activities: {} }));
  s.data.set(AICS_KEYS.flag, '1');
  assert.equal(run(s).status, 'repaired');
});

test('recovery with a corrupt document and unusable legacy data writes nothing', () => {
  const s = new MemStore();
  s.data.set(LEGACY_KEYS.abc, '{oops');
  s.data.set(AICS_KEYS.progress, '{oops');
  s.data.set(AICS_KEYS.flag, '1');
  s.resetCounters();
  assert.equal(run(s).status, 'no-valid-legacy-data');
  assert.deepEqual(s.writes, []);
});

test('malformed legacy values still produce a document that passes strict validation', () => {
  const s = legacyStore();
  s.data.set(LEGACY_KEYS.curriculum, JSON.stringify({ records: {
    'phonics:0': { ok: -5, wrong: 'x', tries: 1e99, due: '??' }, 'phonics:1': { ok: 2.7 }, 'bogus:1': { ok: 1 }, 'urdu:999': {}, 'words:2': 7,
  } }));
  s.data.set(LEGACY_KEYS.abc, JSON.stringify({ A: true, b: true, '': true, AA: true, C: 'yes' }));
  s.data.set(LEGACY_KEYS.quests, JSON.stringify({ ['q'.repeat(65)]: true, ok: 1, nope: 0 }));
  assert.equal(run(s).status, 'migrated');
  assert.ok(readProgressDoc(s));
});

test('write interrupted after the document but before the flag leaves a repairable state', () => {
  const s = legacyStore();
  s.failWriteNumber = 2; // flag write fails
  const r = run(s);
  assert.equal(r.status, 'failed');
  assert.equal(s.data.has(AICS_KEYS.flag), false);
  assert.equal(s.data.has(AICS_KEYS.progress), false);
  s.failWriteNumber = 0;
  assert.equal(run(s).status, 'migrated');
});
