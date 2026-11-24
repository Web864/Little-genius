import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES, COMPETENCIES, COUNTRIES, DOMAINS, FRAMEWORKS, FUTURE_MARKETS, MAPPINGS,
  resolveProfile, validateRegistries,
} from '../../src/aics/index.ts';

test('registries are internally consistent', () => {
  assert.deepEqual(validateRegistries(), []);
});

test('14 domains, unique stable ids, every domain has a competency', () => {
  assert.equal(DOMAINS.length, 14);
  for (const d of DOMAINS) assert.ok(COMPETENCIES.some((c) => c.domain === d.id), 'no competency for ' + d.id);
  assert.equal(new Set(COMPETENCIES.map((c) => c.id)).size, COMPETENCIES.length);
});

test('nothing is above Draft status and no reviewer is invented', () => {
  for (const c of COMPETENCIES) { assert.equal(c.status, 'draft'); assert.equal(c.reviewer, null); }
  for (const f of FRAMEWORKS) { assert.equal(f.status, 'draft'); assert.equal(f.reviewer, null); }
  for (const m of MAPPINGS) { assert.ok(m.status === 'draft' || m.status === 'pending-source'); assert.equal(m.reviewer, null); }
});

test('every activity that offers Urdu stays Draft', () => {
  const urdu = ACTIVITIES.filter((a) => a.languages.includes('ur'));
  assert.ok(urdu.length >= 2);
  for (const a of urdu) assert.equal(a.contentStatus, 'draft');
  assert.ok(ACTIVITIES.filter((a) => !a.languages.includes('ur')).every((a) => a.contentStatus === 'existing' || (a.id.endsWith('-draft') && a.contentStatus === 'draft' && !!a.reviewNote)));
});

test('pending Pakistan and UAE sources are flagged, not hidden', () => {
  const snc = FRAMEWORKS.find((f) => f.id === 'snc-ecce-2020')!;
  assert.equal(snc.verification, 'partial');
  assert.equal(snc.urlConfirmed, false);
  assert.ok(!MAPPINGS.some((m) => m.status === 'pending-source' && m.frameworkId === 'snc-ecce-2020'), 'SNC 2.4–2.10 are imported');
  const uae = FRAMEWORKS.find((f) => f.id === 'uae-moe-kg-overlay')!;
  assert.equal(uae.verification, 'partial');
  assert.equal(uae.kind, 'overlay');
});

test('EYFS is the 2026 version and the superseded 2025 version is absent', () => {
  const e = FRAMEWORKS.find((f) => f.id === 'eyfs-2026')!;
  assert.equal(e.effectiveDate, '2026-09-01');
  assert.ok(!FRAMEWORKS.some((f) => f.id === 'eyfs-2025'));
});

test('upcoming Pakistan curricula are tracked but not selectable', () => {
  for (const id of ['pk-nncp-2026', 'pk-punjab-2027']) {
    const f = FRAMEWORKS.find((x) => x.id === id)!;
    assert.equal(f.selectable, false);
    assert.notEqual(f.verification, 'primary-verified');
    assert.equal(f.status, 'draft');
  }
  assert.equal(FRAMEWORKS.find((x) => x.id === 'pk-punjab-2027')!.verification, 'secondary-only');
  const r = resolveProfile({ countryCode: 'PK', frameworkId: 'pk-nncp-2026' });
  assert.equal(r.baseFrameworkId, 'snc-ecce-2020');
  assert.ok(r.warnings.length > 0);
});

test('resolveProfile: default, overlay, unknown country, and never publishable while Draft', () => {
  assert.equal(resolveProfile().baseFrameworkId, 'intl-core');
  assert.equal(resolveProfile({ countryCode: 'XX' }).baseFrameworkId, 'intl-core');
  assert.ok(resolveProfile({ countryCode: 'XX' }).warnings[0].includes('Unknown country'));
  const ae = resolveProfile({ countryCode: 'AE' });
  assert.equal(ae.baseFrameworkId, 'intl-core');
  assert.deepEqual(ae.overlayIds, ['uae-moe-kg-overlay']);
  assert.equal(resolveProfile({ countryCode: 'GB-ENG' }).baseFrameworkId, 'eyfs-2026');
  for (const c of COUNTRIES) assert.equal(resolveProfile({ countryCode: c.code }).publishable, false);
});

test('framework requested for the wrong country is rejected', () => {
  const r = resolveProfile({ countryCode: 'GB-ENG', frameworkId: 'snc-ecce-2020' });
  assert.equal(r.baseFrameworkId, 'eyfs-2026');
});

test('future markets are listed without any framework or claim', () => {
  assert.ok(FUTURE_MARKETS.length > 10);
  assert.ok(!COUNTRIES.some((c) => c.status === 'future'));
});

test('validator catches a broken reference (self-check of the validator)', () => {
  const bad = MAPPINGS.find((m) => m.id === 'map.eyfs.cl-speaking')!;
  const original = bad.competencyIds;
  (bad as { competencyIds: string[] }).competencyIds = [...original, 'cmp.zzz.nope.9'];
  try {
    assert.ok(validateRegistries().some((e) => e.includes('cmp.zzz.nope.9')));
  } finally {
    (bad as { competencyIds: string[] }).competencyIds = original;
  }
  assert.deepEqual(validateRegistries(), []);
});

test('validator blocks publishing without reviewer or confirmed URL', () => {
  const f = FRAMEWORKS.find((x) => x.id === 'eyfs-2026')! as { status: string; reviewer: unknown; urlConfirmed: boolean };
  f.status = 'published';
  f.urlConfirmed = false;
  try {
    const errs = validateRegistries();
    assert.ok(errs.some((e) => e.includes('without reviewer')));
    assert.ok(errs.some((e) => e.includes('confirmed source URL')));
  } finally {
    f.status = 'draft';
    f.urlConfirmed = true;
  }
  assert.deepEqual(validateRegistries(), []);
});
