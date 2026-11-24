// Phase 7, priority 3 (client side + shared validation): school-level curriculum defaults.
// A school (one licence) may set a default country/curriculum, the age bands it teaches, languages, and class programmes.
// Rules: the server is the authority (see schoolService.ts); this file only validates, caches per account and resolves.
//  - defaults apply ONLY while the signed-in account is on an active licence, and never override an adult's own completed choice;
//  - no child data (class labels only), no roles/permissions, no school id supplied by the client;
//  - every pack stays Draft: a school default can only pick curricula the wizard already offers.
import { readProfile, frameworkOptions, languageOptions, LANGUAGES, STAGES } from './onboardingService.ts';
import type { AdultProfile, Lang, Stage } from './onboardingService.ts';
import { getCountry } from './countryRegistry.ts';
import { SCHOOL_DEFAULTS_CACHE_KEY } from './accountScope.ts';
import type { StorageLike } from './types.ts';

export const SCHOOL_CONFIG_SCHEMA = 1;
export const MAX_CLASSES = 20;
export interface ClassProgramme { id: string; name: string; stage: Stage; frameworkId: string | null; languages: Lang[] }
export interface SchoolCurriculumConfig {
  schema: 1; countryCode: string; frameworkId: string; stages: Stage[]; defaultStage: Stage; languages: Lang[];
  classes: ClassProgramme[]; version: number; updatedAt: string;
}
export type ConfigInput = Omit<SchoolCurriculumConfig, 'version' | 'updatedAt'> & { version?: number; updatedAt?: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const FIELDS = new Set(['schema', 'countryCode', 'frameworkId', 'stages', 'defaultStage', 'languages', 'classes', 'version', 'updatedAt']);
const CLASS_FIELDS = new Set(['id', 'name', 'stage', 'frameworkId', 'languages']);
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const uniq = (a: unknown[]): boolean => new Set(a).size === a.length;
const NAME_RE = /^[^<>\u0000-\u001f]{1,40}$/u;
const CLASS_ID_RE = /^[a-z0-9-]{1,32}$/;

/** Strict validation of untrusted input (request body or cached copy). Returns problems, or the normalised config. */
export function validateSchoolConfig(v: unknown): { ok: true; config: ConfigInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(v)) return { ok: false, errors: ['not an object'] };
  for (const k of Object.keys(v)) if (!FIELDS.has(k)) errors.push('unexpected field: ' + k); // incl. role, permissions, licenceId, schoolId
  if (v.schema !== SCHOOL_CONFIG_SCHEMA) errors.push('unsupported schema');
  const country = typeof v.countryCode === 'string' ? getCountry(v.countryCode) : undefined;
  if (!country || country.status === 'future') errors.push('unknown country');
  const fwOk = !!country && typeof v.frameworkId === 'string' && frameworkOptions(country.code).some((f) => f.id === v.frameworkId);
  if (!fwOk) errors.push('curriculum not available for this country');
  const langOpts = country ? languageOptions(country.code) : [];
  const langsOk = (x: unknown): x is Lang[] => Array.isArray(x) && x.length > 0 && x.length <= LANGUAGES.length && x.every((l) => inList(langOpts, l)) && uniq(x);
  if (!langsOk(v.languages)) errors.push('bad languages');
  if (!Array.isArray(v.stages) || v.stages.length === 0 || !v.stages.every((s) => inList(STAGES, s)) || !uniq(v.stages)) errors.push('bad age bands');
  if (!inList(STAGES, v.defaultStage) || (Array.isArray(v.stages) && !v.stages.includes(v.defaultStage))) errors.push('default age band must be one of the school\'s age bands');
  const classes: ClassProgramme[] = [];
  if (!Array.isArray(v.classes) || v.classes.length > MAX_CLASSES) errors.push('too many classes');
  else {
    const ids: string[] = [];
    for (const c of v.classes) {
      if (!isObj(c)) { errors.push('bad class'); continue; }
      for (const k of Object.keys(c)) if (!CLASS_FIELDS.has(k)) errors.push('unexpected class field: ' + k);
      const name = typeof c.name === 'string' ? c.name.trim() : '';
      if (typeof c.id !== 'string' || !CLASS_ID_RE.test(c.id)) errors.push('bad class id');
      if (!NAME_RE.test(name)) errors.push('bad class name');
      if (!inList(STAGES, c.stage) || (Array.isArray(v.stages) && !v.stages.includes(c.stage))) errors.push('class age band not offered by the school');
      const fw = c.frameworkId ?? null;
      if (fw !== null && !(country && typeof fw === 'string' && frameworkOptions(country.code).some((f) => f.id === fw))) errors.push('class curriculum not available');
      if (!langsOk(c.languages) || (langsOk(v.languages) && !(c.languages as Lang[]).every((l) => (v.languages as Lang[]).includes(l)))) errors.push('class languages must be among the school\'s languages');
      ids.push(String(c.id));
      classes.push({ id: String(c.id), name, stage: c.stage as Stage, frameworkId: fw as string | null, languages: c.languages as Lang[] });
    }
    if (!uniq(ids)) errors.push('duplicate class id');
  }
  if (v.version !== undefined && !(Number.isInteger(v.version) && (v.version as number) >= 0 && (v.version as number) < 1e9)) errors.push('bad version');
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: {
    schema: 1, countryCode: v.countryCode as string, frameworkId: v.frameworkId as string, stages: [...(v.stages as Stage[])],
    defaultStage: v.defaultStage as Stage, languages: [...(v.languages as Lang[])], classes,
    version: v.version as number | undefined, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined,
  } };
}

// ---- per-account cache (lives in the account vault, so it follows account isolation) ----------------------------------------
export interface SchoolDefaultsCache { schema: 1; config: SchoolCurriculumConfig; licensedUntil: string; fetchedAt: string; classId: string | null }

export function readSchoolDefaults(storage: StorageLike | null, now: () => number = Date.now): SchoolDefaultsCache | null {
  try {
    const raw = storage?.getItem(SCHOOL_DEFAULTS_CACHE_KEY);
    if (!raw) return null;
    const c: unknown = JSON.parse(raw);
    if (!isObj(c) || c.schema !== 1 || typeof c.licensedUntil !== 'string' || typeof c.fetchedAt !== 'string') return null;
    if (!(Date.parse(c.licensedUntil) > now())) return null; // licence ended: defaults stop applying immediately
    const v = validateSchoolConfig(c.config);
    if (!v.ok || v.config.version === undefined || !v.config.updatedAt) return null;
    const classId = typeof c.classId === 'string' ? c.classId : null;
    return { schema: 1, config: v.config as SchoolCurriculumConfig, licensedUntil: c.licensedUntil, fetchedAt: c.fetchedAt, classId: classId && v.config.classes.some((x) => x.id === classId) ? classId : null };
  } catch { return null; }
}
export function clearSchoolDefaultsCache(storage: StorageLike | null): void { try { storage?.removeItem(SCHOOL_DEFAULTS_CACHE_KEY); } catch { /* ignore */ } }
/** The adult picks which class programme this device/account is for. Stored only in this account's slot. */
export function chooseClass(storage: StorageLike | null, classId: string | null, now: () => number = Date.now): boolean {
  const c = readSchoolDefaults(storage, now);
  if (!c || !storage) return false;
  if (classId !== null && !c.config.classes.some((x) => x.id === classId)) return false;
  try { storage.setItem(SCHOOL_DEFAULTS_CACHE_KEY, JSON.stringify({ ...c, classId })); return true; } catch { return false; }
}

export interface ApiLike { get(url: string): Promise<{ data: unknown }> }
/**
 * Refresh the cache from the server. The server decides entitlement from the verified sign-in; the client sends no school id.
 * Not licensed, or any error/403 -> the cache is removed (nothing server-side is deleted).
 */
export async function syncSchoolDefaults(api: ApiLike, storage: StorageLike | null, accessStatus: string | undefined, now: () => number = Date.now): Promise<'applied' | 'none' | 'cleared' | 'error'> {
  if (!storage) return 'error';
  if (accessStatus !== 'licensed') { clearSchoolDefaultsCache(storage); return 'cleared'; }
  try {
    const r = await api.get('/api/school/curriculum');
    const d = r.data;
    if (!isObj(d) || typeof d.licensedUntil !== 'string' || Date.parse(d.licensedUntil) <= now()) { clearSchoolDefaultsCache(storage); return 'cleared'; }
    if (d.config === null) { clearSchoolDefaultsCache(storage); return 'none'; }
    const v = validateSchoolConfig(d.config);
    if (!v.ok || v.config.version === undefined || !v.config.updatedAt) { clearSchoolDefaultsCache(storage); return 'error'; }
    const prev = readSchoolDefaults(storage, now);
    const entry: SchoolDefaultsCache = { schema: 1, config: v.config as SchoolCurriculumConfig, licensedUntil: d.licensedUntil, fetchedAt: new Date(now()).toISOString(), classId: prev?.classId ?? null };
    storage.setItem(SCHOOL_DEFAULTS_CACHE_KEY, JSON.stringify(entry));
    return 'applied';
  } catch { clearSchoolDefaultsCache(storage); return 'cleared'; }
}

// ---- resolution --------------------------------------------------------------------------------------------------------------
/** An adult's own completed choice always wins. Otherwise active school defaults (or the chosen class programme) apply. Not stored. */
export function effectiveProfile(storage: StorageLike | null, now: () => number = Date.now): AdultProfile | null {
  let own: AdultProfile | null = null;
  try { own = storage ? readProfile(storage) : null; } catch { own = null; }
  if (own && own.status === 'completed') return own;
  const school = readSchoolDefaults(storage, now);
  if (!school) return own; // none, or a skipped choice: exactly as before
  const cls = school.classId ? school.config.classes.find((c) => c.id === school.classId) : undefined;
  const cfg = school.config;
  return {
    schema: 1, status: 'completed', updatedAt: cfg.updatedAt, setting: 'school', countryCode: cfg.countryCode,
    frameworkId: cls?.frameworkId ?? cfg.frameworkId, stage: cls?.stage ?? cfg.defaultStage, languages: [...(cls?.languages ?? cfg.languages)], modules: [],
  };
}
