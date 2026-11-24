// Phase 6: localization architecture. Pure logic, no DOM, nothing here is wired into a screen yet.
// Rules: ur/ar catalogs hold no educational content (only endonyms). Everything is Draft until a named native educator reviews it.
// UI wording variants (US/UK) are applied automatically ONLY to UI strings; learning content is never auto-rewritten.
import type { AdultProfile, Lang } from './onboardingService.ts';
import type { ReviewStatus } from './types.ts';

export type Locale = 'en-US' | 'en-GB' | 'ur' | 'ar';
export type Direction = 'ltr' | 'rtl';
export type NumeralSystem = 'latn' | 'native';
export const DEFAULT_LOCALE: Locale = 'en-US';
export const GB_VARIANT_COUNTRIES: readonly string[] = ['GB-ENG', 'PK', 'AE']; // Draft decision: British spelling for these markets

export interface LocaleInfo {
  locale: Locale; language: Lang; direction: Direction; endonym: string; bcp47: string;
  fallback: Locale | null; status: ReviewStatus; reviewer: string | null;
}
export const LOCALES: Readonly<Record<Locale, LocaleInfo>> = {
  'en-US': { locale: 'en-US', language: 'en', direction: 'ltr', endonym: 'English (US)', bcp47: 'en-US', fallback: null, status: 'draft', reviewer: null },
  'en-GB': { locale: 'en-GB', language: 'en', direction: 'ltr', endonym: 'English (UK)', bcp47: 'en-GB', fallback: 'en-US', status: 'draft', reviewer: null },
  ur: { locale: 'ur', language: 'ur', direction: 'rtl', endonym: 'اردو', bcp47: 'ur-PK', fallback: 'en-US', status: 'draft', reviewer: null },
  ar: { locale: 'ar', language: 'ar', direction: 'rtl', endonym: 'العربية', bcp47: 'ar', fallback: 'en-US', status: 'draft', reviewer: null },
};

// ---- message catalogs ------------------------------------------------------------------------------------------
export interface Catalog { locale: Locale; status: ReviewStatus; reviewer: string | null; messages: Readonly<Record<string, string>> }
export const CATALOGS: readonly Catalog[] = [
  { locale: 'en-US', status: 'draft', reviewer: null, messages: {
    'worlds.mathGroup': 'Math & Thinking',
    'audio.computerVoice': 'Computer voice',
    'audio.noVoice': 'No voice for this language is installed on this device. The written activity still works.',
    'lang.self': 'English',
  } },
  { locale: 'en-GB', status: 'draft', reviewer: null, messages: { 'worlds.mathGroup': 'Maths & Thinking', 'lang.self': 'English' } },
  // Intentionally empty apart from the endonym: no Urdu/Arabic educational or instructional text is invented here.
  { locale: 'ur', status: 'draft', reviewer: null, messages: { 'lang.self': 'اردو' } },
  { locale: 'ar', status: 'draft', reviewer: null, messages: { 'lang.self': 'العربية' } },
];

export interface Translated { text: string; key: string; usedLocale: Locale | null; fellBack: boolean; missing: boolean }

/** requested -> its registered fallback chain -> en-US. A missing key returns the key itself, flagged. */
export function chainOf(locale: Locale): Locale[] {
  const out: Locale[] = []; let cur: Locale | null = locale;
  while (cur && !out.includes(cur)) { out.push(cur); cur = LOCALES[cur].fallback; }
  if (!out.includes(DEFAULT_LOCALE)) out.push(DEFAULT_LOCALE);
  return out;
}
export function t(key: string, locale: Locale, params: Record<string, string | number> = {}, catalogs: readonly Catalog[] = CATALOGS): Translated {
  for (const l of chainOf(locale)) {
    const msg = catalogs.find((c) => c.locale === l)?.messages[key];
    if (msg !== undefined) return { text: fill(msg, params), key, usedLocale: l, fellBack: l !== locale, missing: false };
  }
  return { text: key, key, usedLocale: null, fellBack: true, missing: true };
}
const fill = (msg: string, p: Record<string, string | number>): string => msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));

// ---- English variants (US / UK) ---------------------------------------------------------------------------------
export type GlossaryScope = 'ui' | 'content';
export interface GlossaryEntry { us: string; gb: string; scope: GlossaryScope; autoApply: boolean; status: ReviewStatus; note?: string }
// 'ui' entries may be auto-applied to interface strings. 'content' entries are advisory: picture words and taught vocabulary
// are never rewritten automatically (changing "cookie" to "biscuit" changes what the picture means).
export const GLOSSARY: readonly GlossaryEntry[] = [
  { us: 'color', gb: 'colour', scope: 'ui', autoApply: true, status: 'draft' },
  { us: 'favorite', gb: 'favourite', scope: 'ui', autoApply: true, status: 'draft' },
  { us: 'math', gb: 'maths', scope: 'ui', autoApply: true, status: 'draft' },
  { us: 'neighbor', gb: 'neighbour', scope: 'ui', autoApply: true, status: 'draft' },
  { us: 'practice', gb: 'practise', scope: 'ui', autoApply: false, status: 'draft', note: 'Noun stays "practice" in UK English; verb only. Not auto-applied.' },
  { us: 'cookie', gb: 'biscuit', scope: 'content', autoApply: false, status: 'draft', note: 'Picture word: advisory only.' },
  { us: 'truck', gb: 'lorry', scope: 'content', autoApply: false, status: 'draft', note: 'Picture word: advisory only.' },
  { us: 'diaper', gb: 'nappy', scope: 'content', autoApply: false, status: 'draft', note: 'Picture word: advisory only.' },
  { us: 'cotton candy', gb: 'candy floss', scope: 'content', autoApply: false, status: 'draft', note: 'Picture word: advisory only.' },
];
const matchCase = (src: string, rep: string): string => (src === src.toUpperCase() && src.length > 1 ? rep.toUpperCase() : src[0] === src[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep);
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Interface strings only. Whole words, case preserved, only autoApply+ui entries. */
export function applyUiVariant(text: string, locale: Locale, glossary: readonly GlossaryEntry[] = GLOSSARY): string {
  if (locale !== 'en-GB') return text;
  return glossary.filter((g) => g.scope === 'ui' && g.autoApply).reduce(
    (acc, g) => acc.replace(new RegExp('\\b' + esc(g.us) + '\\b', 'gi'), (m) => matchCase(m, g.gb)), text);
}
export interface VariantAdvice { us: string; gb: string; note?: string }
/** Learning content: reports words that differ between variants. Never changes the text. */
export function adviseContent(text: string, glossary: readonly GlossaryEntry[] = GLOSSARY): VariantAdvice[] {
  return glossary.filter((g) => new RegExp('\\b' + esc(g.us) + '\\b', 'i').test(text)).map((g) => ({ us: g.us, gb: g.gb, note: g.note }));
}

// ---- RTL ---------------------------------------------------------------------------------------------------------
export const directionOf = (language: string): Direction => (language === 'ur' || language === 'ar' ? 'rtl' : 'ltr');
export const htmlAttrs = (locale: Locale): string => `lang="${LOCALES[locale].bcp47}" dir="${LOCALES[locale].direction}"`;
/** Fonts are NOT bundled. These are system stacks; Nastaliq rendering for Urdu is only as good as the device. Needs native review. */
export const FONT_STACKS: Readonly<Record<Lang, { stack: string; bundled: false; needsNativeReview: true }>> = {
  en: { stack: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', bundled: false, needsNativeReview: true },
  ur: { stack: '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Segoe UI", Tahoma, serif', bundled: false, needsNativeReview: true },
  ar: { stack: '"Noto Naskh Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif', bundled: false, needsNativeReview: true },
};
/** Numerals policy: Latin digits by default (matches the existing app); native digits only when chosen. */
export function formatNumber(n: number, locale: Locale, system: NumeralSystem = 'latn'): string {
  const tag = system === 'native' && locale === 'ur' ? 'ur-PK-u-nu-arabext' : system === 'native' && locale === 'ar' ? 'ar-u-nu-arab' : LOCALES[locale].bcp47 + '-u-nu-latn';
  return new Intl.NumberFormat(tag, { useGrouping: false }).format(n);
}
/** Wrap mixed-direction text so an English word inside Urdu (or the reverse) does not reorder the line. */
export const isolate = (text: string, dir: Direction): string => (dir === 'rtl' ? '⁧' : '⁦') + text + '⁩';

// ---- resolution from the adult profile ---------------------------------------------------------------------------
export interface ResolvedLocale {
  ui: Locale; englishVariant: 'en-US' | 'en-GB'; learnerLanguages: Lang[]; learnerLocales: Locale[];
  rtlLearning: boolean; interfaceDirection: Direction;
}
/** No profile (existing users): exactly today's behaviour, en-US, left-to-right, English only. */
export function resolveLocale(profile: AdultProfile | null): ResolvedLocale {
  const completed = !!profile && profile.status === 'completed';
  const variant = completed && GB_VARIANT_COUNTRIES.includes(profile!.countryCode) ? 'en-GB' : 'en-US';
  const langs: Lang[] = completed && profile!.languages.length ? [...profile!.languages] : ['en'];
  const learnerLocales = langs.map((l): Locale => (l === 'en' ? variant : l));
  // The interface itself stays English: ur/ar catalogs carry no instructions, so the UI never flips to RTL on its own.
  return { ui: variant, englishVariant: variant, learnerLanguages: langs, learnerLocales, rtlLearning: langs.some((l) => directionOf(l) === 'rtl'), interfaceDirection: 'ltr' };
}

// ---- validation --------------------------------------------------------------------------------------------------
export function validateLocalization(catalogs: readonly Catalog[] = CATALOGS, glossary: readonly GlossaryEntry[] = GLOSSARY): string[] {
  const errs: string[] = [];
  const base = catalogs.find((c) => c.locale === DEFAULT_LOCALE);
  if (!base) return ['no default catalog'];
  const ph = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const c of catalogs) {
    if (!(c.locale in LOCALES)) errs.push('unknown locale ' + c.locale);
    if (c.status !== 'draft' && !c.reviewer) errs.push(c.locale + ': above Draft needs a named reviewer');
    if ((c.locale === 'ur' || c.locale === 'ar') && c.status !== 'draft' && !c.reviewer) errs.push(c.locale + ': native-educator review required');
    for (const [k, v] of Object.entries(c.messages)) {
      if (!v.trim()) errs.push(c.locale + '.' + k + ': empty');
      const b = base.messages[k];
      if (b !== undefined && ph(b) !== ph(v)) errs.push(c.locale + '.' + k + ': placeholders differ from en-US');
    }
    if ((c.locale === 'ur' || c.locale === 'ar')) {
      const extra = Object.keys(c.messages).filter((k) => k !== 'lang.self');
      if (extra.length && c.status === 'draft') errs.push(c.locale + ': unreviewed Urdu/Arabic text must not ship, only the endonym is allowed: ' + extra.join(','));
    }
  }
  for (const g of glossary) {
    if (g.scope === 'content' && g.autoApply) errs.push('glossary "' + g.us + '": content entries must never auto-apply');
    if (g.status !== 'draft') errs.push('glossary "' + g.us + '": must stay Draft until reviewed');
  }
  for (const l of Object.values(LOCALES)) if (l.status !== 'draft' && !l.reviewer) errs.push(l.locale + ': locale above Draft needs a reviewer');
  return errs;
}
