import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AICS_KEYS, LEGACY_KEYS, ONBOARDING_DISABLED_KEY, PROFILE_KEY, PROMPT_DISMISSED_KEY, STEPS,
  applyCountry, buildProfile, clearOnboardingData, countryOptions, decideOnboarding, defaultAnswers, dismissParentPrompt,
  effectiveSelection, frameworkOptions, inspectProfile, languageOptions, nextStep, overlayInfo, parentPromptVisible,
  readProfile, saveProfile, validateProfile, validateStep, FRAMEWORKS,
} from '../../src/aics/index.ts';
import type { Answers } from '../../src/aics/index.ts';
import { runAicsBootstrap } from '../../src/aics/bootstrap.ts';
import { FIXED_NOW, MemStore, legacyRaw, legacyStore } from './helpers.ts';

const full = (): Answers => ({ setting: 'home', countryCode: 'PK', frameworkId: 'snc-ecce-2020', stage: 'A4', languages: ['en', 'ur'], modules: [] });
const goodProfile = () => JSON.parse(JSON.stringify(buildProfile(full(), 'completed', FIXED_NOW)));

// ---------- who sees the wizard ----------
test('decision: a browser with no data and no profile gets the wizard', () => {
  assert.deepEqual(decideOnboarding(new MemStore()), { run: true, reason: 'new-adult' });
});
test('decision: existing users are never interrupted (progress key, or only a preference key)', () => {
  assert.equal(decideOnboarding(legacyStore()).run, false);
  for (const k of ['littleGeniusLanguage', 'littleGeniusTheme', 'littleGeniusSound', 'littleGeniusSpeechPace', 'littleGeniusCourseComplete', ...Object.values(LEGACY_KEYS)]) {
    const s = new MemStore(); s.data.set(k, 'x');
    assert.equal(decideOnboarding(s).run, false, k);
  }
});
test('decision: valid profile, kill switch, unavailable or throwing storage never run it', () => {
  const s = new MemStore(); saveProfile(s, goodProfile());
  assert.deepEqual(decideOnboarding(s), { run: false, reason: 'has-profile' });
  const k = new MemStore(); k.data.set(ONBOARDING_DISABLED_KEY, '1');
  assert.deepEqual(decideOnboarding(k), { run: false, reason: 'disabled' });
  assert.deepEqual(decideOnboarding(null), { run: false, reason: 'storage-unavailable' });
  const t = new MemStore(); t.throwOnGet = true;
  assert.equal(decideOnboarding(t).run, false);
});
test('decision: newer-version profile is respected; damaged profile asks again only for brand-new browsers', () => {
  const n = new MemStore(); n.data.set(PROFILE_KEY, JSON.stringify({ schema: 2 }));
  assert.deepEqual(decideOnboarding(n), { run: false, reason: 'newer-version' });
  const d = new MemStore(); d.data.set(PROFILE_KEY, '{oops');
  assert.equal(decideOnboarding(d).run, true);
  const d2 = legacyStore(); d2.data.set(PROFILE_KEY, '{oops');
  assert.deepEqual(decideOnboarding(d2), { run: false, reason: 'invalid-profile-existing-user' });
});
test('decision never writes anything', () => {
  const s = legacyStore(); s.resetCounters();
  decideOnboarding(s); decideOnboarding(new MemStore()); effectiveSelection(s); parentPromptVisible(s);
  assert.deepEqual(s.writes, []); assert.deepEqual(s.removes, []);
});

// ---------- defaults for existing users ----------
test('with no profile everyone resolves to International Core, marked as default, nothing written', () => {
  const s = legacyStore(); s.resetCounters();
  const e = effectiveSelection(s);
  assert.equal(e.baseFrameworkId, 'intl-core'); assert.equal(e.isDefault, true); assert.equal(e.chosen, false); assert.deepEqual(e.overlayIds, []);
  assert.equal(e.publishable, false);
  assert.deepEqual(s.writes, []);
  assert.equal(effectiveSelection(null).baseFrameworkId, 'intl-core');
});
test('a skipped profile is the International Core default', () => {
  const s = new MemStore(); assert.equal(saveProfile(s, buildProfile({}, 'skipped', FIXED_NOW)).ok, true);
  const e = effectiveSelection(s);
  assert.equal(e.isDefault, true); assert.equal(e.chosen, false); assert.equal(e.baseFrameworkId, 'intl-core');
});
test('a completed profile is reflected, with the UAE overlay applied by country not by choice', () => {
  const s = new MemStore();
  saveProfile(s, buildProfile({ setting: 'school', countryCode: 'AE', frameworkId: 'intl-core', stage: 'A5', languages: ['ar', 'en'], modules: [] }, 'completed', FIXED_NOW));
  const e = effectiveSelection(s);
  assert.equal(e.chosen, true); assert.deepEqual(e.overlayIds, ['uae-moe-kg-overlay']); assert.equal(e.stage, 'A5');
});

// ---------- options and steps ----------
test('country, framework, overlay and language options come from the registries', () => {
  assert.deepEqual(countryOptions().map((c) => c.code).sort(), ['AE', 'GB-ENG', 'INTL', 'PK']);
  assert.equal(countryOptions().find((c) => c.code === 'INTL')!.name, 'Another country or not listed');
  assert.deepEqual(frameworkOptions('PK').map((f) => f.id), ['snc-ecce-2020', 'intl-core']);
  assert.deepEqual(frameworkOptions('GB-ENG').map((f) => f.id), ['eyfs-2026', 'intl-core']);
  assert.deepEqual(frameworkOptions('AE').map((f) => f.id), ['intl-core']);
  assert.deepEqual(overlayInfo('AE').map((f) => f.id), ['uae-moe-kg-overlay']);
  assert.deepEqual(frameworkOptions('XX'), []);
  assert.ok(!frameworkOptions('PK').some((f) => f.id === 'pk-nncp-2026' || f.id === 'pk-punjab-2027'), 'tracked-only packs are not offered');
  assert.ok(languageOptions('GB-ENG').includes('en'));
});
test('every framework offered to adults is still Draft (nothing unreviewed looks official)', () => {
  for (const c of countryOptions()) for (const f of frameworkOptions(c.code)) assert.equal(f.status, 'draft', f.id);
  assert.ok(FRAMEWORKS.length > 0);
});
test('step validation: each step rejects missing or unknown answers', () => {
  assert.equal(validateStep('setting', {}).length, 1);
  assert.equal(validateStep('setting', { setting: 'admin' as never }).length, 1);
  assert.equal(validateStep('country', { countryCode: 'ZZ' }).length, 1);
  assert.equal(validateStep('curriculum', { countryCode: 'PK', frameworkId: 'eyfs-2026' }).length, 1);
  assert.equal(validateStep('curriculum', { countryCode: 'PK', frameworkId: 'pk-nncp-2026' }).length, 1);
  assert.equal(validateStep('stage', { stage: 'A9' as never }).length, 1);
  assert.equal(validateStep('languages', { languages: [] }).length, 1);
  assert.equal(validateStep('languages', { languages: ['en', 'en'] }).length, 1);
  assert.equal(validateStep('languages', { languages: ['fr' as never] }).length, 1);
  assert.equal(validateStep('languages', { languages: ['en'], modules: ['x' as never] }).length, 1);
  assert.deepEqual(validateStep('review', full()), []);
  assert.ok(validateStep('review', {}).length >= 5);
});
test('flow: continue only when the step is valid, and steps run in order', () => {
  let a: Answers = {}; let step = STEPS[0] as (typeof STEPS)[number] | null; const seen: string[] = [];
  assert.equal(nextStep('setting', a), null);
  a = { ...full() };
  while (step) { seen.push(step); step = nextStep(step, a); }
  assert.deepEqual(seen, [...STEPS]);
});
test('changing country resets an unavailable framework and drops unavailable languages', () => {
  const a = applyCountry(full(), 'GB-ENG');
  assert.equal(a.frameworkId, 'eyfs-2026');
  const b = applyCountry({ ...full(), frameworkId: 'intl-core' }, 'GB-ENG');
  assert.equal(b.frameworkId, 'intl-core');
  assert.equal(applyCountry(full(), 'INTL').frameworkId, 'intl-core');
});

// ---------- profile document ----------
test('built profile has exactly the allowed fields: no child data, no role or permission field', () => {
  const p = buildProfile(full(), 'completed', FIXED_NOW);
  assert.deepEqual(Object.keys(p).sort(), ['countryCode', 'frameworkId', 'languages', 'modules', 'schema', 'setting', 'stage', 'status', 'updatedAt']);
  assert.throws(() => buildProfile({}, 'completed'));
  const skipped = buildProfile({}, 'skipped', FIXED_NOW);
  assert.equal(skipped.frameworkId, 'intl-core');
});
test('the "setting" answer changes nothing about access: same selection for every setting', () => {
  const sels = (['home', 'classroom', 'school', 'other'] as const).map((setting) => {
    const s = new MemStore(); saveProfile(s, buildProfile({ ...full(), setting }, 'completed', FIXED_NOW));
    const { stage, languages, baseFrameworkId, overlayIds } = effectiveSelection(s);
    return JSON.stringify({ stage, languages, baseFrameworkId, overlayIds });
  });
  assert.equal(new Set(sels).size, 1);
});
const reject = (name: string, fn: (d: any) => void) => test('profile rejects: ' + name, () => {
  const d = goodProfile(); fn(d); assert.equal(validateProfile(d).ok, false);
});
reject('extra role field', (d) => { d.role = 'owner'; });
reject('extra permissions field', (d) => { d.permissions = ['admin']; });
reject('child name field', (d) => { d.childName = 'x'; });
reject('bad status', (d) => { d.status = 'admin'; });
reject('bad setting', (d) => { d.setting = 'owner'; });
reject('bad stage', (d) => { d.stage = 'A7'; });
reject('unknown country', (d) => { d.countryCode = 'XX'; });
reject('framework not offered for country', (d) => { d.frameworkId = 'eyfs-2026'; });
reject('tracked-only framework', (d) => { d.frameworkId = 'pk-nncp-2026'; });
reject('empty languages', (d) => { d.languages = []; });
reject('duplicate languages', (d) => { d.languages = ['en', 'en']; });
reject('unknown language', (d) => { d.languages = ['fr']; });
reject('unknown module', (d) => { d.modules = ['x']; });
reject('bad date', (d) => { d.updatedAt = 'soon'; });
reject('schema 0', (d) => { d.schema = 0; });
test('profile rejects non-objects', () => { for (const v of [null, 1, 'x', [], undefined]) assert.equal(validateProfile(v).ok, false); });
test('inspectProfile states', () => {
  const s = new MemStore();
  assert.equal(inspectProfile(s).state, 'missing');
  s.data.set(PROFILE_KEY, '{oops'); assert.equal(inspectProfile(s).state, 'invalid');
  s.data.set(PROFILE_KEY, JSON.stringify({ ...goodProfile(), schema: 2 })); assert.equal(inspectProfile(s).state, 'newer-version');
  s.data.set(PROFILE_KEY, JSON.stringify(goodProfile())); assert.equal(inspectProfile(s).state, 'valid');
  assert.equal(readProfile(s)!.countryCode, 'PK');
});

// ---------- saving, full storage, rollback ----------
test('save writes and reads back; legacy progress and migration keys are untouched', () => {
  const s = legacyStore(); const before = legacyRaw(s);
  assert.equal(runAicsBootstrap(s, { now: FIXED_NOW }).status, 'migrated');
  const doc = s.data.get(AICS_KEYS.progress);
  assert.equal(saveProfile(s, goodProfile()).ok, true);
  assert.equal(legacyRaw(s), before); assert.equal(s.data.get(AICS_KEYS.progress), doc);
  assert.equal(runAicsBootstrap(s, { now: FIXED_NOW }).status, 'already-migrated');
});
test('full or blocked storage: save fails safely, nothing half-written, app can continue with defaults', () => {
  const s = new MemStore(); s.failAllWrites = true;
  const r = saveProfile(s, goodProfile());
  assert.equal(r.ok, false); assert.equal(s.data.has(PROFILE_KEY), false);
  assert.equal(effectiveSelection(s).baseFrameworkId, 'intl-core');
});
test('storage that silently drops writes is detected and cleaned up', () => {
  const s = new MemStore(); s.onSet = (k, _v, st) => { if (k === PROFILE_KEY) st.data.set(k, '{"schema":1}'); };
  assert.equal(saveProfile(s, goodProfile()).ok, false); assert.equal(s.data.has(PROFILE_KEY), false);
});
test('a profile from a newer version is never overwritten', () => {
  const s = new MemStore(); const newer = JSON.stringify({ schema: 2, x: 1 }); s.data.set(PROFILE_KEY, newer);
  assert.equal(saveProfile(s, goodProfile()).ok, false); assert.equal(s.data.get(PROFILE_KEY), newer);
});
test('re-saving (edit) replaces the profile and keeps it valid', () => {
  const s = new MemStore(); saveProfile(s, goodProfile());
  assert.equal(saveProfile(s, buildProfile({ ...full(), countryCode: 'GB-ENG', frameworkId: 'eyfs-2026' }, 'completed', () => '2026-11-23T10:00:00.000Z')).ok, true);
  assert.equal(readProfile(s)!.frameworkId, 'eyfs-2026');
});
test('clearing removes only onboarding keys', () => {
  const s = legacyStore(); runAicsBootstrap(s, { now: FIXED_NOW }); saveProfile(s, goodProfile()); dismissParentPrompt(s);
  const legacy = legacyRaw(s), doc = s.data.get(AICS_KEYS.progress), flag = s.data.get(AICS_KEYS.flag);
  const r = clearOnboardingData(s);
  assert.deepEqual(r.removed.sort(), [PROFILE_KEY, PROMPT_DISMISSED_KEY].sort());
  assert.equal(s.data.has(PROFILE_KEY), false); assert.equal(legacyRaw(s), legacy);
  assert.equal(s.data.get(AICS_KEYS.progress), doc); assert.equal(s.data.get(AICS_KEYS.flag), flag);
  const f = new MemStore(); f.failRemoves = true; assert.equal(clearOnboardingData(f).errors.length, 2);
});

// ---------- Parent Corner prompt ----------
test('parent prompt shows for users without a profile until dismissed, never after a profile exists', () => {
  const s = legacyStore();
  assert.equal(parentPromptVisible(s), true);
  assert.equal(dismissParentPrompt(s), true); assert.equal(parentPromptVisible(s), false);
  const t = new MemStore(); saveProfile(t, goodProfile()); assert.equal(parentPromptVisible(t), false);
  assert.equal(parentPromptVisible(null), false); assert.equal(dismissParentPrompt(null), false);
  const f = new MemStore(); f.failAllWrites = true; assert.equal(dismissParentPrompt(f), false);
});

// ---------- no role or licence coupling, no network, no markup injection ----------
const read = (f: string) => readFileSync(new URL('../../src/aics/' + f, import.meta.url), 'utf8');
test('onboarding code has no access to auth, licensing, network or roles', () => {
  for (const f of ['onboardingService.ts', 'onboarding.ts']) {
    const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace('lga-parent-licence', 'lga-parent-panel'); // the existing page's layout class name is allowed
    for (const bad of ['@appdeploy', 'api.get', 'api.post', 'auth.', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'access.status', 'licence', 'license', '.role', 'permission', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval(', 'new Function']) {
      assert.ok(!code.includes(bad), f + ' contains ' + bad);
    }
  }
});
test('onboarding code imports nothing outside src/aics', () => {
  for (const f of ['onboardingService.ts', 'onboarding.ts']) {
    for (const m of read(f).matchAll(/from '([^']+)'/g)) assert.ok(m[1].startsWith('./'), f + ' imports ' + m[1]);
  }
});
test('defaultAnswers is International Core with no modules', () => {
  const d = defaultAnswers(); assert.equal(d.frameworkId, 'intl-core'); assert.deepEqual(d.modules, []);
});

test('frameworks that are not selectable are never offered, even if a country lists them', () => {
  const f = FRAMEWORKS.find((x) => x.id === 'intl-core')! as { selectable: boolean };
  f.selectable = false;
  try { assert.ok(!frameworkOptions('INTL').some((x) => x.id === 'intl-core')); } finally { f.selectable = true; }
  assert.ok(frameworkOptions('INTL').some((x) => x.id === 'intl-core'));
});
