import { getCountry, resolveProfile, COUNTRIES } from './countryRegistry.ts';
import { getFramework } from './curriculumRegistry.ts';
import type { Country, Framework, StorageLike } from './types.ts';
import { LEGACY_KEYS } from './progressService.ts';

// Phase 3 onboarding logic. Pure and storage-injected so it is testable without a browser.
// Rules: adult-only choices; no child name, date of birth, photo, voice or location; stored on this device only.
// SECURITY: the "setting" answer only changes wording. Nothing here reads or grants roles, licences or permissions.

export const PROFILE_KEY = 'lgaAicsProfileV1';
export const PROMPT_DISMISSED_KEY = 'lgaAicsParentPromptDismissed';
export const ONBOARDING_DISABLED_KEY = 'lgaAicsOnboardingDisabled'; // '1' turns the first-run wizard off
export const PROFILE_SCHEMA = 1;

export const SETTINGS = ['home', 'classroom', 'school', 'other'] as const;
export type Setting = (typeof SETTINGS)[number];
export const STAGES = ['A3', 'A4', 'A5', 'mixed'] as const;
export type Stage = (typeof STAGES)[number];
export const LANGUAGES = ['en', 'ur', 'ar'] as const;
export type Lang = (typeof LANGUAGES)[number];
export const MODULES = ['faith-values'] as const;
export type ModuleId = (typeof MODULES)[number];

export interface AdultProfile {
  schema: 1;
  status: 'completed' | 'skipped';
  updatedAt: string;
  setting: Setting;
  countryCode: string;
  frameworkId: string;
  stage: Stage;
  languages: Lang[];
  modules: ModuleId[];
}
export interface Answers {
  setting?: Setting;
  countryCode?: string;
  frameworkId?: string;
  stage?: Stage;
  languages?: Lang[];
  modules?: ModuleId[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

// ---------- steps ----------
export const STEPS = ['setting', 'country', 'curriculum', 'stage', 'languages', 'review'] as const;
export type StepId = (typeof STEPS)[number];

export const STAGE_LABEL: Record<Stage, string> = { A3: 'About 3–4 years', A4: 'About 4–5 years', A5: 'About 5–6 years', mixed: 'Mixed ages or not sure' };
export const SETTING_LABEL: Record<Setting, string> = { home: 'At home (parent or carer)', classroom: 'In a classroom (teacher)', school: 'For a school or nursery', other: 'Something else' };
export const LANGUAGE_LABEL: Record<Lang, string> = { en: 'English', ur: 'Urdu / اردو', ar: 'Arabic / العربية' };
export const MODULE_LABEL: Record<ModuleId, string> = { 'faith-values': 'Faith and values module' };

/** Countries shown in the wizard. INTL is presented as "another country or not listed". */
export function countryOptions(): { code: string; name: string }[] {
  return COUNTRIES.filter((c) => c.status !== 'future').map((c) => ({ code: c.code, name: c.code === 'INTL' ? 'Another country or not listed' : c.name }));
}

/** Base frameworks an adult may pick for this country. Overlays are applied by the country, not picked. */
export function frameworkOptions(countryCode: string): Framework[] {
  const c = getCountry(countryCode);
  if (!c) return [];
  return c.frameworkIds.map((id) => getFramework(id)).filter((f): f is Framework => !!f && f.kind === 'base' && f.selectable);
}
export function overlayInfo(countryCode: string): Framework[] {
  const c = getCountry(countryCode);
  if (!c) return [];
  return c.overlayIds.map((id) => getFramework(id)).filter((f): f is Framework => !!f && f.selectable);
}
export function languageOptions(countryCode: string): Lang[] {
  const c: Country | undefined = getCountry(countryCode);
  const offered = new Set<string>(['en', ...(c?.languages ?? []), 'ur']);
  return LANGUAGES.filter((l) => offered.has(l));
}
export const defaultFrameworkFor = (countryCode: string): string => resolveProfile({ countryCode }).baseFrameworkId;

/** Validation for one step; returns a list of plain-language problems (empty = OK). */
export function validateStep(step: StepId, a: Answers): string[] {
  switch (step) {
    case 'setting':
      return inList(SETTINGS, a.setting) ? [] : ['Please choose who is setting this up.'];
    case 'country':
      return a.countryCode && getCountry(a.countryCode) && getCountry(a.countryCode)!.status !== 'future' ? [] : ['Please choose a country.'];
    case 'curriculum':
      return a.countryCode && a.frameworkId && frameworkOptions(a.countryCode).some((f) => f.id === a.frameworkId) ? [] : ['Please choose a curriculum option.'];
    case 'stage':
      return inList(STAGES, a.stage) ? [] : ['Please choose an age range.'];
    case 'languages': {
      const ls = a.languages ?? [];
      if (ls.length === 0) return ['Please choose at least one language.'];
      if (!ls.every((l) => inList(LANGUAGES, l))) return ['Unknown language selected.'];
      if (new Set(ls).size !== ls.length) return ['Duplicate language selected.'];
      if (!(a.modules ?? []).every((m) => inList(MODULES, m))) return ['Unknown module selected.'];
      return [];
    }
    case 'review':
      return STEPS.filter((s) => s !== 'review').flatMap((s) => validateStep(s, a));
  }
}

/** Changing the country invalidates a framework that country does not offer; resets it to that country's default. */
export function applyCountry(a: Answers, countryCode: string): Answers {
  const next: Answers = { ...a, countryCode };
  if (!a.frameworkId || !frameworkOptions(countryCode).some((f) => f.id === a.frameworkId)) next.frameworkId = defaultFrameworkFor(countryCode);
  const allowed = new Set(languageOptions(countryCode));
  if (a.languages) next.languages = a.languages.filter((l) => allowed.has(l));
  return next;
}

export function nextStep(step: StepId, a: Answers): StepId | null {
  if (validateStep(step, a).length) return null;
  const i = STEPS.indexOf(step);
  return i < STEPS.length - 1 ? STEPS[i + 1] : null;
}
export const prevStep = (step: StepId): StepId | null => { const i = STEPS.indexOf(step); return i > 0 ? STEPS[i - 1] : null; };

// ---------- profile document ----------
/** Safe default used for everyone who has not chosen anything (existing users included). Nothing is written. */
export function defaultAnswers(): Required<Answers> {
  return { setting: 'other', countryCode: 'INTL', frameworkId: 'intl-core', stage: 'mixed', languages: ['en', 'ur'], modules: [] };
}

export function buildProfile(a: Answers, status: 'completed' | 'skipped', now: () => string = () => new Date().toISOString()): AdultProfile {
  if (status === 'skipped') {
    const d = defaultAnswers();
    return { schema: 1, status, updatedAt: now(), ...d };
  }
  const errs = validateStep('review', a);
  if (errs.length) throw new Error('Incomplete answers: ' + errs.join(' '));
  return {
    schema: 1, status, updatedAt: now(), setting: a.setting!, countryCode: a.countryCode!, frameworkId: a.frameworkId!,
    stage: a.stage!, languages: [...a.languages!], modules: [...(a.modules ?? [])],
  };
}

export type ProfileValidation = { ok: true; profile: AdultProfile } | { ok: false; reason: string; newer?: boolean };
const FIELDS = new Set(['schema', 'status', 'updatedAt', 'setting', 'countryCode', 'frameworkId', 'stage', 'languages', 'modules']);

/** Strict validation of a stored profile: schema, field set, types, enumerations and registry references. */
export function validateProfile(v: unknown): ProfileValidation {
  const bad = (reason: string, newer = false): ProfileValidation => ({ ok: false, reason, newer });
  if (!isObj(v)) return bad('not an object');
  if (v.schema !== PROFILE_SCHEMA) return bad('unsupported schema: ' + String(v.schema), typeof v.schema === 'number' && v.schema > PROFILE_SCHEMA);
  for (const k of Object.keys(v)) if (!FIELDS.has(k)) return bad('unexpected field: ' + k);
  if (v.status !== 'completed' && v.status !== 'skipped') return bad('bad status');
  if (typeof v.updatedAt !== 'string' || Number.isNaN(Date.parse(v.updatedAt))) return bad('bad updatedAt');
  if (!inList(SETTINGS, v.setting)) return bad('bad setting');
  if (!inList(STAGES, v.stage)) return bad('bad stage');
  if (typeof v.countryCode !== 'string' || !getCountry(v.countryCode)) return bad('unknown country');
  if (typeof v.frameworkId !== 'string' || !frameworkOptions(v.countryCode).some((f) => f.id === v.frameworkId)) return bad('framework not available for country');
  if (!Array.isArray(v.languages) || v.languages.length === 0 || v.languages.length > LANGUAGES.length || !v.languages.every((l) => inList(LANGUAGES, l)) || new Set(v.languages).size !== v.languages.length) return bad('bad languages');
  if (!Array.isArray(v.modules) || !v.modules.every((m) => inList(MODULES, m)) || new Set(v.modules).size !== v.modules.length) return bad('bad modules');
  return { ok: true, profile: v as unknown as AdultProfile };
}

export type ProfileState =
  | { state: 'missing' }
  | { state: 'valid'; profile: AdultProfile }
  | { state: 'invalid'; reason: string }
  | { state: 'newer-version' };

export function inspectProfile(storage: StorageLike): ProfileState {
  let raw: string | null;
  try { raw = storage.getItem(PROFILE_KEY); } catch { return { state: 'invalid', reason: 'could not read' }; }
  if (raw === null) return { state: 'missing' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { state: 'invalid', reason: 'not valid JSON' }; }
  const r = validateProfile(parsed);
  if (r.ok) return { state: 'valid', profile: r.profile };
  return r.newer ? { state: 'newer-version' } : { state: 'invalid', reason: r.reason };
}
export const readProfile = (s: StorageLike): AdultProfile | null => { const r = inspectProfile(s); return r.state === 'valid' ? r.profile : null; };

export type SaveResult = { ok: true; profile: AdultProfile } | { ok: false; error: string };
/** Writes then reads back. Never throws. Never overwrites a profile written by a newer version. */
export function saveProfile(storage: StorageLike, profile: AdultProfile): SaveResult {
  try {
    const check = validateProfile(JSON.parse(JSON.stringify(profile)));
    if (!check.ok) return { ok: false, error: 'Profile failed validation: ' + check.reason };
    if (inspectProfile(storage).state === 'newer-version') return { ok: false, error: 'A newer version of this app saved settings here.' };
    storage.setItem(PROFILE_KEY, JSON.stringify(profile));
    const back = readProfile(storage);
    if (!back || back.updatedAt !== profile.updatedAt) {
      try { storage.removeItem(PROFILE_KEY); } catch { /* best effort */ }
      return { ok: false, error: 'Could not confirm the saved settings.' };
    }
    return { ok: true, profile: back };
  } catch (e) {
    return { ok: false, error: 'Could not save settings on this device (' + String(e) + ').' };
  }
}

/** Removes only the onboarding keys. Never touches legacy progress or migration keys. Never throws. */
export function clearOnboardingData(storage: StorageLike): { removed: string[]; errors: string[] } {
  const removed: string[] = [], errors: string[] = [];
  for (const k of [PROFILE_KEY, PROMPT_DISMISSED_KEY]) {
    try { storage.removeItem(k); removed.push(k); } catch (e) { errors.push(k + ': ' + String(e)); }
  }
  return { removed, errors };
}

// ---------- who sees the wizard ----------
export type Decision =
  | { run: true; reason: 'new-adult' }
  | { run: false; reason: 'storage-unavailable' | 'disabled' | 'has-profile' | 'newer-version' | 'existing-user' | 'invalid-profile-existing-user' | 'held-progress' };

const LEGACY_VALUES = new Set<string>(Object.values(LEGACY_KEYS));

/** True if this browser already holds Little Genius data: progress keys or any preference such as language or theme. */
export function hasExistingAppData(storage: StorageLike): boolean {
  for (const k of LEGACY_VALUES) { try { if (storage.getItem(k) !== null) return true; } catch { /* ignore */ } }
  for (const k of ['littleGeniusLanguage', 'littleGeniusTheme', 'littleGeniusSound', 'littleGeniusSpeechPace', 'littleGeniusCourseComplete']) {
    try { if (storage.getItem(k) !== null) return true; } catch { /* ignore */ }
  }
  return false;
}

/**
 * First-run decision. Existing users (any saved progress or preference) are never interrupted and keep the
 * International Core default. Only a browser with no profile and no earlier app data gets the wizard.
 */
/** True when browser data is held in quarantine (accountScope). Literal key prefix on purpose: no import cycle. */
function heldQuarantine(storage: StorageLike): boolean {
  for (let i = 1; i <= 20; i++) if (storage.getItem('lgaAicsVaultV1:q' + i) !== null) return true;
  return false;
}
export function decideOnboarding(storage: StorageLike | null): Decision {
  if (!storage) return { run: false, reason: 'storage-unavailable' };
  try {
    if (storage.getItem(ONBOARDING_DISABLED_KEY) === '1') return { run: false, reason: 'disabled' };
    const p = inspectProfile(storage);
    if (p.state === 'valid') return { run: false, reason: 'has-profile' };
    if (p.state === 'newer-version') return { run: false, reason: 'newer-version' };
    if (heldQuarantine(storage)) return { run: false, reason: 'held-progress' }; // saved progress is on hold for an adult to claim: this is NOT a new adult
    if (hasExistingAppData(storage)) return { run: false, reason: p.state === 'invalid' ? 'invalid-profile-existing-user' : 'existing-user' };
    if (p.state === 'invalid') return { run: true, reason: 'new-adult' }; // damaged profile and no other data: ask again
    return { run: true, reason: 'new-adult' };
  } catch {
    return { run: false, reason: 'storage-unavailable' };
  }
}

/** What the rest of the app should treat as the active selection. Pure read; defaults to International Core. */
export function effectiveSelection(storage: StorageLike | null) {
  let p: AdultProfile | null = null;
  try { p = storage ? readProfile(storage) : null; } catch { p = null; }
  const a = p ?? { ...defaultAnswers(), status: 'default' as const };
  const resolved = resolveProfile({ countryCode: a.countryCode, frameworkId: a.frameworkId });
  return {
    chosen: !!p && p.status === 'completed',
    isDefault: !p || p.status === 'skipped',
    countryCode: resolved.countryCode,
    baseFrameworkId: resolved.baseFrameworkId,
    overlayIds: resolved.overlayIds,
    stage: a.stage,
    languages: [...a.languages],
    modules: [...a.modules],
    publishable: resolved.publishable,
  };
}

export function parentPromptVisible(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    return readProfile(storage) === null && storage.getItem(PROMPT_DISMISSED_KEY) !== '1';
  } catch { return false; }
}
export function dismissParentPrompt(storage: StorageLike | null): boolean {
  try { storage?.setItem(PROMPT_DISMISSED_KEY, '1'); return !!storage; } catch { return false; }
}
