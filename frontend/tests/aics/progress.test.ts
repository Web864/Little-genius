import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AICS_KEYS, LEGACY_KEYS, migrate, readProgressDoc, resetAicsData, summarizeByCompetency,
} from '../../src/aics/index.ts';
import type { StorageLike } from '../../src/aics/index.ts';

class MemStore implements StorageLike {
  data = new Map<string, string>();
  writes: string[] = [];
  removes: string[] = [];
  failWrites = false;
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { if (this.failWrites) throw new Error('QuotaExceededError'); this.writes.push(k); this.data.set(k, v); }
  removeItem(k: string) { this.removes.push(k); this.data.delete(k); }
}

const FIXED = () => '2026-11-22T10:00:00.000Z';

function legacyStore(): MemStore {
  const s = new MemStore();
  s.data.set(LEGACY_KEYS.abc, JSON.stringify({ A: true, B: true, z: true, '1': true, C: false }));
  s.data.set(LEGACY_KEYS.curriculum, JSON.stringify({
    records: {
      'phonics:0': { ok: 2, wrong: 1, tries: 3, due: '2026-11-25' },
      'urdu:38': { ok: 1, wrong: 0, tries: 1, due: '2026-11-23' },
      'words:7': { ok: 0, wrong: 2, tries: 2, due: 'not-a-date' },
      'stories:2': { ok: 1, wrong: 0, tries: 1, due: '2026-11-23' },
      'urdu:39': { ok: 1 }, 'galaxy:0': { ok: 1 }, 'shapes:-1': { ok: 1 },
    },
    daily: { date: '2026-11-22', step: 2, done: false },
  }));
  s.data.set(LEGACY_KEYS.lost, JSON.stringify({ current: 3, completed: { A: true, B: true } }));
  s.data.set(LEGACY_KEYS.picture, JSON.stringify({ last: 'C', A: { success: 2, wrong: 1 }, B: { success: 0, wrong: 3 } }));
  s.data.set(LEGACY_KEYS.quests, JSON.stringify({ 'forest-quest': true, 'sea-quest': false }));
  s.data.set('littleGeniusLanguage', 'ur');
  s.data.set('littleGeniusTheme', 'ocean');
  return s;
}

const snapshot = (s: MemStore) => JSON.stringify([...s.data.entries()].filter(([k]) => k.startsWith('littleGenius')).sort());

test('migration maps every legacy source and leaves legacy keys byte-identical', () => {
  const s = legacyStore();
  const before = snapshot(s);
  const r = migrate(s, { now: FIXED });
  assert.equal(r.status, 'migrated');
  assert.equal(snapshot(s), before, 'legacy keys changed');
  assert.deepEqual(s.removes, []);
  assert.deepEqual([...new Set(s.writes)].sort(), [AICS_KEYS.flag, AICS_KEYS.progress].sort());
  const doc = readProgressDoc(s)!;
  assert.equal(doc.schema, 1);
  assert.equal(doc.migratedAt, '2026-11-22T10:00:00.000Z');
  // lowercase 'z' is normalised to 'letter:Z'; the digit key '1' and value false are skipped
  assert.deepEqual(Object.keys(doc.activities['act.lit.abc']).sort(), ['letter:A', 'letter:B', 'letter:Z']);
  assert.deepEqual(doc.activities['act.lit.sounds']['phonics:0'], { ok: 2, wrong: 1, tries: 3, due: '2026-11-25' });
  assert.ok(doc.activities['act.lit.urdu-letters']['urdu:38']);
  assert.equal(doc.activities['act.lit.words']['words:7'].due, undefined, 'invalid date must be dropped');
  assert.ok(doc.activities['act.lang.stories']['stories:2']);
  assert.deepEqual(Object.keys(doc.activities['act.lit.lost-letters']).sort(), ['letter:A', 'letter:B']);
  assert.deepEqual(doc.activities['act.lit.picture-rescue']['letter:A'], { ok: 2, wrong: 1, tries: 3, completed: true });
  assert.equal(doc.activities['act.lit.picture-rescue']['letter:B'].completed, false);
  assert.deepEqual(Object.keys(doc.activities['act.pat.quests']), ['quest:forest-quest']);
  // skipped: abc '1' and 'C':false (2) + curriculum urdu:39, galaxy:0, shapes:-1 (3) + quest false (1)
  assert.equal(doc.skipped, 6);
});

test('migration is idempotent and does not rewrite after the flag is set', () => {
  const s = legacyStore();
  migrate(s, { now: FIXED });
  const docBefore = s.data.get(AICS_KEYS.progress);
  s.writes = [];
  const again = migrate(s, { now: () => '2030-01-01T00:00:00.000Z' });
  assert.equal(again.status, 'already-migrated');
  assert.deepEqual(s.writes, []);
  assert.equal(s.data.get(AICS_KEYS.progress), docBefore);
});

test('force re-run produces the same activities', () => {
  const s = legacyStore();
  migrate(s, { now: FIXED });
  const a = readProgressDoc(s)!.activities;
  migrate(s, { now: FIXED, force: true });
  assert.deepEqual(readProgressDoc(s)!.activities, a);
});

test('empty storage migrates to an empty document without error', () => {
  const s = new MemStore();
  const r = migrate(s, { now: FIXED });
  assert.equal(r.status, 'migrated');
  assert.deepEqual(readProgressDoc(s)!.activities, {});
});

test('corrupt or wrongly shaped legacy data is ignored, recorded, and never thrown', () => {
  const s = new MemStore();
  s.data.set(LEGACY_KEYS.abc, '{not json');
  s.data.set(LEGACY_KEYS.curriculum, JSON.stringify([1, 2, 3]));
  s.data.set(LEGACY_KEYS.lost, JSON.stringify({ completed: 'yes' }));
  s.data.set(LEGACY_KEYS.picture, 'null');
  const r = migrate(s, { now: FIXED });
  assert.equal(r.status, 'migrated');
  const doc = readProgressDoc(s)!;
  assert.deepEqual(doc.activities, {});
  assert.ok(doc.issues.length >= 3);
  assert.equal(s.data.get(LEGACY_KEYS.abc), '{not json', 'corrupt legacy value must be left untouched');
});

test('storage write failure returns failed and does not set the flag', () => {
  const s = legacyStore();
  s.failWrites = true;
  const r = migrate(s, { now: FIXED });
  assert.equal(r.status, 'failed');
  assert.equal(s.data.get(AICS_KEYS.flag), undefined);
  s.failWrites = false;
  assert.equal(migrate(s, { now: FIXED }).status, 'migrated');
});

test('interrupted run (document written, flag missing) is repaired by re-running', () => {
  const s = legacyStore();
  migrate(s, { now: FIXED });
  s.data.delete(AICS_KEYS.flag);
  assert.equal(migrate(s, { now: FIXED }).status, 'migrated');
  assert.equal(s.data.get(AICS_KEYS.flag), '1');
});

test('the migrated document holds no personal data fields', () => {
  const s = legacyStore();
  migrate(s, { now: FIXED });
  const text = s.data.get(AICS_KEYS.progress)!;
  for (const word of ['name', 'birth', 'dob', 'photo', 'voice', 'location', 'email', 'language', 'theme']) {
    assert.ok(!new RegExp('"' + word, 'i').test(text), 'unexpected field: ' + word);
  }
});

test('resetAicsData removes only AICS keys', () => {
  const s = legacyStore();
  migrate(s, { now: FIXED });
  const before = snapshot(s);
  resetAicsData(s);
  assert.equal(s.data.has(AICS_KEYS.progress), false);
  assert.equal(s.data.has(AICS_KEYS.flag), false);
  assert.equal(snapshot(s), before);
});

test('competency summary counts attempts through the activity catalogue', () => {
  const s = legacyStore();
  migrate(s, { now: FIXED });
  const sum = summarizeByCompetency(readProgressDoc(s)!);
  const letters = sum.find((x) => x.competencyId === 'cmp.lit.letters.1')!;
  assert.ok(letters.itemsCompleted >= 2);
  const reading = sum.find((x) => x.competencyId === 'cmp.lit.reading.1')!;
  assert.equal(reading.itemsCompleted, 0, 'words:7 had no correct answers');
  assert.equal(reading.itemsTried, 1);
});

test('readProgressDoc returns null for missing or foreign data', () => {
  const s = new MemStore();
  assert.equal(readProgressDoc(s), null);
  s.data.set(AICS_KEYS.progress, '{"schema":2}');
  assert.equal(readProgressDoc(s), null);
});
