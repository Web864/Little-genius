import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addClass, classIdFor, draftFromConfig, emptyDraft, friendlyProblems, toBody, validateSchoolConfig, withCountry } from '../../src/aics/index.ts';
import type { SchoolCurriculumConfig } from '../../src/aics/index.ts';

// Phase 9: pure form model behind the School Portal settings screen.
test('an empty draft builds a body the server-side validation accepts, and the version travels with it', () => {
  const b = toBody(emptyDraft(), 0); assert.deepEqual(friendlyProblems(b), []); assert.equal(b.version, 0);
  const v = validateSchoolConfig(b); assert.ok(v.ok);
  assert.deepEqual(Object.keys(b).sort(), ['classes', 'countryCode', 'defaultStage', 'frameworkId', 'languages', 'schema', 'stages', 'version'], 'no role, licence id or school id is ever sent');
});

test('classes: ids come from names, are unique and valid, existing ids never change, 20 maximum', () => {
  assert.equal(classIdFor('Sunflowers', []), 'sunflowers'); assert.equal(classIdFor('Sunflowers', ['sunflowers']), 'sunflowers-2'); assert.equal(classIdFor('!!!', []), 'class'); assert.equal(classIdFor('Room 3 – Blue', []), 'room-3-blue');
  let d = emptyDraft(); for (let i = 0; i < 25; i++) d = addClass(d); assert.equal(d.classes.length, 20);
  d = { ...d, classes: d.classes.map((c, i) => ({ ...c, name: i < 2 ? 'Same' : 'C' + i })) };
  const b = toBody(d, 0); const ids = b.classes.map((c) => c.id); assert.equal(new Set(ids).size, 20); assert.deepEqual(friendlyProblems(b), []);
  const keep = toBody({ ...emptyDraft(), classes: [{ id: 'old-id', name: 'Renamed', stage: 'A4', frameworkId: null, languages: ['en'] }] }, 3);
  assert.equal(keep.classes[0].id, 'old-id', 'renaming a class does not change its id');
});

test('friendly problems: plain language, no raw validator text, covers each rule', () => {
  const base = toBody(emptyDraft(), 0);
  const cases: [Partial<typeof base>, RegExp][] = [
    [{ countryCode: 'ZZ' }, /country/i], [{ frameworkId: 'nope' }, /curricula/], [{ languages: [] }, /language/], [{ stages: [] }, /age band/],
    [{ defaultStage: 'A5', stages: ['A3'] }, /default age band/], [{ classes: [{ id: 'x', name: '', stage: 'A4', frameworkId: null, languages: ['en'] }] }, /short name/],
    [{ classes: [{ id: 'x', name: 'a<b', stage: 'A4', frameworkId: null, languages: ['en'] }] }, /short name/],
    [{ classes: [{ id: 'x', name: 'A', stage: 'A3', frameworkId: null, languages: ['en'] }], stages: ['A4'], defaultStage: 'A4' }, /age band/],
  ];
  for (const [over, re] of cases) { const p = friendlyProblems({ ...base, ...over } as never); assert.ok(p.length > 0 && p.every((x) => re.test(x) || /age band|language|country|curricula|name/i.test(x)), JSON.stringify(over)); assert.ok(p.every((x) => !/unexpected field|bad class id|schema/.test(x))); }
});

test('changing country resets what depends on it; class settings that no longer apply fall back to the school', () => {
  let d = emptyDraft(); d = { ...d, languages: ['en', 'ur'], classes: [{ id: 'a', name: 'A', stage: 'A4', frameworkId: 'zzz', languages: ['ur'] }] };
  const e = withCountry(d, 'PK'); assert.equal(e.countryCode, 'PK'); assert.deepEqual(friendlyProblems(toBody(e, 0)), []);
  for (const code of ['INTL', 'GB-ENG', 'PK', 'AE']) { const x = withCountry(emptyDraft(), code); const p = friendlyProblems(toBody(x, 0)); assert.deepEqual(p, [], code); }
  assert.equal(withCountry(d, 'INTL').classes[0].frameworkId, null);
});

test('draftFromConfig round-trips a saved configuration', () => {
  const cfg: SchoolCurriculumConfig = { schema: 1, countryCode: 'INTL', frameworkId: toBody(emptyDraft(), 0).frameworkId, stages: ['A4', 'A5'], defaultStage: 'A5', languages: ['en'], classes: [{ id: 'sun', name: 'Sun', stage: 'A5', frameworkId: null, languages: ['en'] }], version: 4, updatedAt: '2026-11-22T00:00:00.000Z' };
  const b = toBody(draftFromConfig(cfg), cfg.version); assert.deepEqual({ ...b }, { schema: 1, countryCode: cfg.countryCode, frameworkId: cfg.frameworkId, stages: cfg.stages, defaultStage: cfg.defaultStage, languages: cfg.languages, classes: cfg.classes, version: 4 });
  assert.deepEqual(draftFromConfig(null), emptyDraft());
});
