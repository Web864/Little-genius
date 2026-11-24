import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITIES, FRAMEWORKS, MAPPINGS, REAL_WORLD, contentDigest, evaluateGates, resolveProfile } from '../../src/aics/index.ts';
import type { ReviewEntry, ReviewRole, World } from '../../src/aics/index.ts';

// Phase 9 readiness findings, computed from the real registries and the real release gates (nothing typed in by hand).
// These tests pin the matrix in the tracker: if registry content or gate rules change, the tracker's readiness section must change too.
const draftIds = new Set(ACTIVITIES.filter((a) => a.contentStatus !== 'existing').map((a) => a.id));
const decoupled: World = { ...REAL_WORLD, mappings: MAPPINGS.map((m) => ({ ...m, activityIds: m.activityIds.filter((id) => !draftIds.has(id)) })) };
const reviewsFor = (w: World, id: string, roles: ReviewRole[]): ReviewEntry[] => roles.map((role) => ({ role, reviewer: 'Owner-recorded reviewer', note: '', at: '2026-11-22T00:00:00Z', digest: contentDigest(id, w)! }));
const ALL: ReviewRole[] = ['educator', 'primary-source', 'native-educator'];
const reviewOnly = (b: string): boolean => /^Missing .* review|published without reviewer|^Mapping .* published without reviewer/.test(b);

test('today: every real pack is refused; nothing can reach children; all packs, rows and Draft activities stay Draft', () => {
  for (const f of FRAMEWORKS) { assert.ok(evaluateGates(f.id, [], REAL_WORLD).blockers.length > 0, f.id); assert.equal(f.status, 'draft'); }
  for (const m of MAPPINGS) assert.notEqual(m.status, 'published');
  for (const c of ['INTL', 'GB-ENG', 'PK', 'AE']) assert.equal(resolveProfile({ countryCode: c }).publishable, false, c);
});

test('Urdu and Arabic education content stays Draft: the Urdu activities are Draft, no Arabic activity exists, nothing was reviewed', () => {
  const ur = ACTIVITIES.filter((a) => a.languages.includes('ur')); assert.ok(ur.some((a) => a.id === 'act.lit.urdu-letters'));
  assert.equal(ACTIVITIES.find((a) => a.id === 'act.lit.urdu-letters')!.contentStatus, 'draft');
  assert.equal(ACTIVITIES.find((a) => a.id === 'act.apl.memory-mission')!.contentStatus, 'draft');
  assert.equal(ACTIVITIES.filter((a) => a.languages.includes('ar')).length, 0, 'no Arabic education activity exists');
  for (const f of FRAMEWORKS) assert.equal(f.reviewer, null, f.id + ' has no reviewer recorded in the registry');
  for (const m of MAPPINGS) assert.equal(m.reviewer, null);
});

test('International Core and England: the only things missing are (1) linked Draft activities and (2) owner-recorded reviews', () => {
  for (const id of ['intl-core', 'eyfs-2026']) {
    const g = evaluateGates(id, [], REAL_WORLD);
    const other = g.blockers.filter((b) => !reviewOnly(b));
    assert.deepEqual(other.sort(), ['Linked activity act.apl.memory-mission is Draft content', 'Linked activity act.lit.urdu-letters is Draft content', ...(id==='intl-core'?['Linked activity act.pat.patterns-draft is Draft content', 'Linked activity act.spa.sorting-draft is Draft content']:[])].sort(), id);
    // a native-language educator is required ONLY because a linked Draft activity is Urdu
    assert.ok(g.requiredRoles.includes('native-educator'), id);
    assert.equal(g.requiredRoles.includes('primary-source'), id === 'eyfs-2026', id + ' primary-source only for the primary-verified pack');
  }
  // if the Draft activities are not linked, only educator (and primary-source for England) reviews remain; with them recorded nothing blocks
  for (const [id, roles] of [['intl-core', ['educator']], ['eyfs-2026', ['educator', 'primary-source']]] as const) {
    const g0 = evaluateGates(id, [], decoupled); assert.deepEqual(g0.requiredRoles, roles, id);
    assert.deepEqual(evaluateGates(id, reviewsFor(decoupled, id, [...roles]), decoupled).blockers, [], id + ' passes every gate once those reviews exist');
    assert.ok(evaluateGates(id, reviewsFor(decoupled, id, ['native-educator']), decoupled).blockers.length > 0, 'a wrong-role review does not count');
  }
  assert.notEqual(contentDigest('intl-core', decoupled), contentDigest('intl-core', REAL_WORLD), 'decoupling changes the digest, so earlier reviews would not carry over');
});

test('Pakistan: even with every review recorded, the SNC pack is blocked by primary verification; NNCP and Punjab are tracked-only and have no rows', () => {
  const snc = FRAMEWORKS.find((f) => f.id === 'snc-ecce-2020')!; assert.equal(snc.verification, 'partial'); assert.equal(snc.urlConfirmed, false);
  const g = evaluateGates('snc-ecce-2020', reviewsFor(decoupled, 'snc-ecce-2020', ALL), decoupled);
  assert.ok(g.blockers.some((b) => /without primary verification/.test(b)) && g.blockers.some((b) => /not primary-verified/.test(b)));
  assert.ok(MAPPINGS.filter((m) => m.frameworkId === 'snc-ecce-2020').every((m) => m.level === 'competency'), 'competency-level rows only; individual outcomes are not mapped');
  for (const id of ['pk-nncp-2026', 'pk-punjab-2027']) {
    const f = FRAMEWORKS.find((x) => x.id === id)!; assert.equal(f.selectable, false); assert.equal(MAPPINGS.filter((m) => m.frameworkId === id).length, 0);
    assert.ok(evaluateGates(id, reviewsFor(REAL_WORLD, id, ALL), REAL_WORLD).blockers.some((b) => /Tracked only/.test(b)), id + ' can never be published while tracked-only');
  }
});

test('UAE: the overlay is blocked by primary verification, rows are area-level only, and the profile also needs the International Core base published', () => {
  const ov = FRAMEWORKS.find((f) => f.id === 'uae-moe-kg-overlay')!; assert.equal(ov.kind, 'overlay'); assert.equal(ov.verification, 'partial'); assert.equal(ov.urlConfirmed, false);
  assert.ok(MAPPINGS.filter((m) => m.frameworkId === 'uae-moe-kg-overlay').every((m) => m.level === 'area'));
  const g = evaluateGates('uae-moe-kg-overlay', reviewsFor(decoupled, 'uae-moe-kg-overlay', ALL), decoupled);
  assert.ok(g.blockers.some((b) => /without primary verification/.test(b)));
  const r = resolveProfile({ countryCode: 'AE' }); assert.equal(r.baseFrameworkId, 'intl-core'); assert.deepEqual(r.overlayIds, ['uae-moe-kg-overlay']);
  assert.equal(ACTIVITIES.filter((a) => a.languages.includes('ar')).length, 0, 'no Arabic content exists to review yet');
});
