import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITIES, COMPETENCIES, FRAMEWORKS, MAPPINGS, activitiesFor, buildPack, listPacks, validateRegistries } from '../../src/aics/index.ts';

const rows = (id: string) => MAPPINGS.filter((m) => m.frameworkId === id);

test('priority packs have the expected outcome-level coverage', () => {
  assert.equal(rows('eyfs-2026').length, 17, '17 Early Learning Goals');
  assert.equal(rows('snc-ecce-2020').length, 39, 'SNC 2.4–2.10 competencies');
  assert.equal(rows('intl-core').length, COMPETENCIES.length, 'one internal row per competency');
  assert.equal(rows('uae-moe-kg-overlay').length, 3, 'subject level only');
  assert.equal(new Set(MAPPINGS.map((m) => m.id)).size, MAPPINGS.length);
});

test('SNC areas follow the source: 2.1 overview and 2.2/2.3 method are not learning areas', () => {
  const areas = new Set(rows('snc-ecce-2020').map((m) => /§(2\.\d+)/.exec(m.sourceRef)![1]));
  assert.deepEqual([...areas].sort(), ['2.10', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9']);
});

test('outcome and competency rows carry a source reference, official ref and a short paraphrase only', () => {
  for (const m of MAPPINGS.filter((x) => x.level === 'outcome' || x.level === 'competency')) {
    assert.ok(m.officialOutcomeRef && m.sourceRef && m.note, m.id);
    assert.ok(m.note.length <= 240, m.id + ' note too long');
  }
  assert.equal(new Set(MAPPINGS.filter((m) => m.level === 'outcome' || m.level === 'competency').map((m) => m.frameworkId + m.officialOutcomeRef)).size, 56);
});

test('everything stays Draft and nothing claims a reviewer or publication', () => {
  for (const m of MAPPINGS) { assert.equal(m.status, 'draft', m.id); assert.equal(m.reviewer, null); }
  for (const p of listPacks()) { assert.equal(p.publishable, false, p.frameworkId); assert.ok(p.blockers.length > 0); }
});

test('UAE overlay does not claim outcome-level text or Arabic activities', () => {
  for (const m of rows('uae-moe-kg-overlay')) {
    assert.equal(m.level, 'area'); assert.equal(m.officialOutcomeRef, null); assert.deepEqual(m.activityIds, []);
  }
  const p = buildPack('uae-moe-kg-overlay')!;
  assert.equal(p.rowsWithActivities, 0);
  assert.equal(p.gapRowIds.length, 3);
});

test('tracked-only Pakistan frameworks have no mappings and are not selectable', () => {
  for (const id of ['pk-nncp-2026', 'pk-punjab-2027']) {
    assert.equal(rows(id).length, 0); assert.equal(buildPack(id)!.selectable, false);
  }
});

test('activity links are derived and respect age bands', () => {
  for (const m of MAPPINGS) for (const a of m.activityIds) {
    const act = ACTIVITIES.find((x) => x.id === a)!;
    assert.ok(act.ageBands.some((b) => m.ageBands.includes(b)), m.id + ' ' + a);
  }
  assert.deepEqual(activitiesFor(['cmp.num.operations.1'], ['A3']), [], 'addition is A4–A5 only');
  assert.ok(activitiesFor(['cmp.num.operations.1'], ['A4']).includes('act.num.addition'));
});

test('honest gaps are reported rather than hidden', () => {
  const eyfs = buildPack('eyfs-2026')!;
  for (const id of ['map.eyfs.utw-natural', 'map.eyfs.pd-gross', 'map.eyfs.utw-pastpresent']) assert.ok(eyfs.gapRowIds.includes(id), id);
  assert.ok(buildPack('snc-ecce-2020')!.gapRowIds.includes('map.snc.2-7-c4'));
  assert.ok(buildPack('intl-core')!.gapRowIds.length > 0);
});

test('existing activities and legacy keys are unchanged', () => {
  assert.equal(ACTIVITIES.length, 17);
  const keys = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a.legacyKey]));
  assert.deepEqual(keys, {
    'act.lit.abc': 'littleGeniusProgress', 'act.lit.sounds': 'littleGeniusConnectedCurriculum',
    'act.lit.words': 'littleGeniusConnectedCurriculum', 'act.lit.urdu-letters': 'littleGeniusConnectedCurriculum',
    'act.spa.shapes': 'littleGeniusConnectedCurriculum', 'act.lang.stories': 'littleGeniusConnectedCurriculum',
    'act.spa.sorting-draft': null, 'act.pat.patterns-draft': null,
    'act.lang.poems': null, 'act.num.numbers': null, 'act.num.addition': null,
    'act.pat.quests': 'littleGeniusAdventureQuests', 'act.lit.lost-letters': 'littleGeniusLostLettersV1',
    'act.lit.picture-rescue': 'littleGeniusPictureRescue', 'act.art.draw': null,
    'act.apl.memory-mission': 'littleGeniusConnectedCurriculum', 'act.dig.daily-discovery': null,
  });
});

function withMutation<T>(fn: () => T, mutate: () => () => void): T {
  const undo = mutate();
  try { return fn(); } finally { undo(); }
}

test('validator rejects outcome rows without ref, source or paraphrase', () => {
  const mp = MAPPINGS.find((m) => m.id === 'map.eyfs.pd-fine')! as unknown as Record<string, unknown>;
  for (const [field, bad, text] of [['officialOutcomeRef', null, 'no official outcome ref'], ['sourceRef', ' ', 'no source reference'], ['note', '', 'no paraphrase']] as const) {
    const errs = withMutation(validateRegistries, () => { const o = mp[field]; mp[field] = bad; return () => { mp[field] = o; }; });
    assert.ok(errs.some((e) => e.includes(text)), field);
  }
  assert.deepEqual(validateRegistries(), []);
});

test('validator rejects over-long notes, bad activity age bands and unknown activities', () => {
  const mp = MAPPINGS.find((m) => m.id === 'map.snc.2-6-c2')! as unknown as Record<string, unknown>;
  let errs = withMutation(validateRegistries, () => { const o = mp.note; mp.note = 'x'.repeat(241); return () => { mp.note = o; }; });
  assert.ok(errs.some((e) => e.includes('too long')));
  errs = withMutation(validateRegistries, () => { const o = mp.ageBands; const a = mp.activityIds; mp.ageBands = ['A3']; mp.activityIds = ['act.num.addition']; return () => { mp.ageBands = o; mp.activityIds = a; }; });
  assert.ok(errs.some((e) => e.includes('no age band in common')));
  errs = withMutation(validateRegistries, () => { const a = mp.activityIds; mp.activityIds = ['act.zzz.nope']; return () => { mp.activityIds = a; }; });
  assert.ok(errs.some((e) => e.includes('unknown activity')));
  assert.deepEqual(validateRegistries(), []);
});

test('validator blocks a mapping above Draft without reviewer or verified source', () => {
  const mp = MAPPINGS.find((m) => m.id === 'map.snc.2-8-c1')! as unknown as Record<string, unknown>;
  const errs = withMutation(validateRegistries, () => { const o = mp.status; mp.status = 'approved'; return () => { mp.status = o; }; });
  assert.ok(errs.some((e) => e.includes('without reviewer')));
  assert.ok(errs.some((e) => e.includes('not primary-verified')));
  assert.deepEqual(validateRegistries(), []);
});

test('a pack cannot leave Draft unless every mapping has been reviewed', () => {
  const f = FRAMEWORKS.find((x) => x.id === 'uae-moe-kg-overlay')! as unknown as Record<string, unknown>;
  const errs = withMutation(validateRegistries, () => { const o = f.status; f.status = 'approved'; return () => { f.status = o; }; });
  assert.ok(errs.some((e) => e.includes('but mapping')));
  assert.deepEqual(validateRegistries(), []);
});

test('no learning screen imports the AICS pack code', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../../src/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const source=readFileSync(new URL(f, dir), 'utf8');
    if(f==='draftJourney.ts'){ assert.match(source,/not<\/strong> an approved national syllabus/); assert.match(source,/row.status === 'draft'/); assert.ok(!/aics\/packs/.test(source)); continue; }
    assert.ok(!/aics\/(packs|curriculumMappings)/.test(source), f);
  }
});

test('EYFS goals follow Reception (age 4–5), assessed at the end of Reception: never A5-only, never A3', () => {
  const r = rows('eyfs-2026');
  assert.equal(r.length, 17);
  for (const m of r) {
    assert.ok(m.ageBands.includes('A4'), m.id);
    assert.ok(!(m.ageBands.length === 1 && m.ageBands[0] === 'A5'), m.id + ' must not be A5-only');
    assert.ok(!m.ageBands.includes('A3'), m.id);
  }
});

test('SNC rows are competency level, not outcome level; detailed outcomes stay pending', () => {
  const r = rows('snc-ecce-2020');
  assert.equal(r.length, 39);
  for (const m of r) {
    assert.equal(m.level, 'competency', m.id);
    assert.match(m.officialOutcomeRef!, /^SNC 2\.\d+ C\d+$/, m.id);
    assert.ok(!/\([a-z]–[a-z]\)/.test(m.officialOutcomeRef!), 'competency ref must not name outcome letters');
  }
  const p = buildPack('snc-ecce-2020')!;
  assert.equal(p.granularity, 'competency');
  assert.equal(p.outcomeRows, 0);
  assert.equal(p.competencyRows, 39);
  assert.equal(p.detailedOutcomesPending, true);
  assert.equal(buildPack('eyfs-2026')!.granularity, 'outcome');
  assert.equal(buildPack('uae-moe-kg-overlay')!.granularity, 'area');
});
