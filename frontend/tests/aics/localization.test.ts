import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOGS, GLOSSARY, LOCALES, adviseContent, applyUiVariant, audioLabel, chainOf, directionOf, formatNumber, htmlAttrs, pickVoice,
  resolveLocale, t, validateClips, validateLocalization,
} from '../../src/aics/index.ts';
import type { AdultProfile, ClipEntry, Lang } from '../../src/aics/index.ts';

const profile = (countryCode: string, languages: Lang[], status: 'completed' | 'skipped' = 'completed'): AdultProfile =>
  ({ schema: 1, status, updatedAt: '2026-11-22T00:00:00.000Z', setting: 'home', countryCode, frameworkId: 'intl-core', stage: 'A4', languages, modules: [] });
const clip = (o: Partial<ClipEntry>): ClipEntry => ({ id: 'c1', text: 'x', language: 'en', source: 'synthetic-tts', provenance: null, reviewer: null, status: 'draft', ...o });

test('shipped catalogs and glossary validate; everything is Draft', () => {
  assert.deepEqual(validateLocalization(), []);
  assert.ok(CATALOGS.every((c) => c.status === 'draft' && c.reviewer === null));
  assert.ok(Object.values(LOCALES).every((l) => l.status === 'draft'));
  assert.ok(GLOSSARY.every((g) => g.status === 'draft'));
});

test('Urdu and Arabic catalogs contain only the endonym (no invented educational text)', () => {
  for (const c of CATALOGS.filter((x) => x.locale === 'ur' || x.locale === 'ar')) assert.deepEqual(Object.keys(c.messages), ['lang.self']);
  assert.equal(t('lang.self', 'ur').text, 'اردو');
  assert.equal(t('lang.self', 'ar').text, 'العربية');
});

test('fallback chain: ur/ar/en-GB fall back to en-US; a missing key is flagged, never invented', () => {
  assert.deepEqual(chainOf('en-GB'), ['en-GB', 'en-US']);
  assert.deepEqual(chainOf('ur'), ['ur', 'en-US']);
  const a = t('audio.computerVoice', 'ur'); assert.equal(a.text, 'Computer voice'); assert.ok(a.fellBack && !a.missing && a.usedLocale === 'en-US');
  assert.equal(t('worlds.mathGroup', 'en-GB').text, 'Maths & Thinking');
  assert.equal(t('worlds.mathGroup', 'en-US').text, 'Math & Thinking');
  const m = t('no.such.key', 'ar'); assert.ok(m.missing && m.text === 'no.such.key');
  assert.equal(t('x', 'en-US', { n: 2 }, [{ locale: 'en-US', status: 'draft', reviewer: null, messages: { x: 'a {n} b {z}' } }]).text, 'a 2 b {z}');
});

test('UI variants auto-apply only to UI entries; content words are advisory and never rewritten', () => {
  assert.equal(applyUiVariant('Favorite color of math', 'en-GB'), 'Favourite colour of maths');
  assert.equal(applyUiVariant('COLOR Math', 'en-GB'), 'COLOUR Maths');
  assert.equal(applyUiVariant('Favorite color', 'en-US'), 'Favorite color');
  assert.equal(applyUiVariant('A cookie on a truck', 'en-GB'), 'A cookie on a truck', 'picture words untouched');
  assert.equal(applyUiVariant('practice', 'en-GB'), 'practice', 'ambiguous verb/noun not auto-applied');
  assert.equal(applyUiVariant('mathematics', 'en-GB'), 'mathematics', 'whole words only');
  const rogue = [{ us: 'cookie', gb: 'biscuit', scope: 'content', autoApply: true, status: 'draft' }] as never;
  assert.equal(applyUiVariant('cookie', 'en-GB', rogue), 'cookie', 'a content-scope entry is never applied to text, even if mis-flagged');
  const adv = adviseContent('The truck has a cookie');
  assert.deepEqual(adv.map((a) => a.gb).sort(), ['biscuit', 'lorry']);
});

test('RTL helpers', () => {
  assert.equal(directionOf('ur'), 'rtl'); assert.equal(directionOf('ar'), 'rtl'); assert.equal(directionOf('en'), 'ltr');
  assert.equal(htmlAttrs('ur'), 'lang="ur-PK" dir="rtl"'); assert.equal(htmlAttrs('en-GB'), 'lang="en-GB" dir="ltr"');
  assert.equal(formatNumber(123, 'en-US'), '123');
  assert.equal(formatNumber(123, 'ur'), '123', 'Latin digits by default');
  assert.equal(formatNumber(123, 'ar', 'native'), '١٢٣');
  assert.equal(formatNumber(123, 'ur', 'native'), '۱۲۳');
});

test('locale resolution: no profile = today\'s behaviour; GB variant for England/Pakistan/UAE; UI never flips to RTL on its own', () => {
  for (const p of [null, profile('PK', ['en'], 'skipped')]) {
    const r = resolveLocale(p); assert.deepEqual([r.ui, r.learnerLanguages, r.rtlLearning, r.interfaceDirection], ['en-US', ['en'], false, 'ltr']);
  }
  assert.equal(resolveLocale(profile('INTL', ['en'])).englishVariant, 'en-US');
  for (const c of ['GB-ENG', 'PK', 'AE']) assert.equal(resolveLocale(profile(c, ['en'])).englishVariant, 'en-GB', c);
  const r = resolveLocale(profile('AE', ['en', 'ar']));
  assert.deepEqual(r.learnerLocales, ['en-GB', 'ar']); assert.ok(r.rtlLearning); assert.equal(r.interfaceDirection, 'ltr');
});

test('validator rejects: unreviewed ur/ar content, placeholder drift, content auto-apply, undeclared reviewer', () => {
  const base = CATALOGS[0];
  const mk = (extra: object) => [base, { locale: 'ur', status: 'draft', reviewer: null, messages: { 'lang.self': 'اردو' }, ...extra }] as never;
  assert.ok(validateLocalization(mk({ messages: { 'lang.self': 'اردو', 'audio.noVoice': 'x' } })).some((e) => /unreviewed Urdu/.test(e)));
  assert.ok(validateLocalization(mk({ status: 'approved' })).some((e) => /reviewer/.test(e)));
  assert.ok(validateLocalization([{ ...base, messages: { ...base.messages, k: 'a {n}' } }, { locale: 'en-GB', status: 'draft', reviewer: null, messages: { k: 'a' } }]).some((e) => /placeholders/.test(e)));
  assert.ok(validateLocalization(CATALOGS, [{ us: 'a', gb: 'b', scope: 'content', autoApply: true, status: 'draft' }]).some((e) => /never auto-apply/.test(e)));
  assert.ok(validateLocalization(CATALOGS, [{ us: 'a', gb: 'b', scope: 'ui', autoApply: true, status: 'approved' }]).some((e) => /Draft/.test(e)));
});

test('audio: synthetic speech is always labelled "Computer voice" and can never be claimed native', () => {
  assert.equal(audioLabel('synthetic-tts'), 'Computer voice');
  assert.deepEqual(validateClips([clip({})]), []);
  assert.ok(validateClips([clip({ source: 'synthetic-tts', reviewer: 'Native speaker A' })]).some((e) => /native/.test(e)));
  assert.ok(validateClips([clip({ file: 'a.mp3' })]).some((e) => /no recorded file/.test(e)));
  assert.ok(validateClips([clip({ provenance: { speaker: 'x', recordedOn: '2026-01-01', consentRecorded: true } })]).some((e) => /provenance/.test(e)));
});

test('audio: recorded and native claims need file, provenance, consent and a named reviewer', () => {
  const prov = { speaker: 'S', recordedOn: '2026-01-01', consentRecorded: true };
  assert.deepEqual(validateClips([clip({ source: 'recorded-other', file: 'a.mp3', provenance: prov })]), []);
  assert.deepEqual(validateClips([clip({ source: 'recorded-native', file: 'a.mp3', provenance: prov, reviewer: 'R' })]), []);
  assert.ok(validateClips([clip({ source: 'recorded-native', file: 'a.mp3', provenance: prov })]).some((e) => /native reviewer/.test(e)));
  assert.ok(validateClips([clip({ source: 'recorded-native', provenance: prov, reviewer: 'R' })]).some((e) => /file/.test(e)));
  assert.ok(validateClips([clip({ source: 'recorded-native', file: 'a', provenance: { ...prov, consentRecorded: false }, reviewer: 'R' })]).some((e) => /consent/.test(e)));
  assert.ok(validateClips([clip({ language: 'ur', status: 'approved' })]).some((e) => /reviewer/.test(e)));
  assert.ok(validateClips([clip({}), clip({})]).some((e) => /duplicate/.test(e)));
  assert.ok(validateClips([clip({ source: 'none', file: 'a' })]).some((e) => /none/.test(e)));
});

test('pickVoice: exact > same language > none; never substitutes another language; result is always synthetic', () => {
  const v = [{ lang: 'en_US', name: 'a' }, { lang: 'en-GB', name: 'b' }, { lang: 'ur-IN', name: 'c' }];
  assert.deepEqual([pickVoice(v, 'en-GB').voice?.name, pickVoice(v, 'en-GB').quality], ['b', 'exact']);
  assert.deepEqual([pickVoice(v, 'en-US').voice?.name, pickVoice(v, 'en-US').quality], ['a', 'exact']);
  const ur = pickVoice(v, 'ur'); assert.deepEqual([ur.voice?.name, ur.quality, ur.source, ur.label], ['c', 'language', 'synthetic-tts', 'Computer voice']);
  const ar = pickVoice(v, 'ar'); assert.deepEqual([ar.voice, ar.quality, ar.source, ar.label], [null, 'none', 'none', 'No audio']);
  assert.equal(pickVoice([{ lang: 'en-US', name: 'a' }], 'ur').voice, null, 'no English voice reading Urdu');
  assert.equal(pickVoice([], 'en-US').quality, 'none');
});
