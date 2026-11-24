import { ACTIVITIES } from './activityRegistry.ts';
import type { StorageLike } from './types.ts';

// Progress migration architecture (Phase 2).
// Rules: legacy keys are only read and are NEVER deleted or modified (non-destructive to legacy storage).
// Migration DOES write two new AICS localStorage keys (the document and the flag), so it is not read-only.
// It is idempotent, and the new document holds no child name, date of birth, photo, voice or location.

export const LEGACY_KEYS = {
  abc: 'littleGeniusProgress',
  curriculum: 'littleGeniusConnectedCurriculum',
  lost: 'littleGeniusLostLettersV1',
  picture: 'littleGeniusPictureRescue',
  quests: 'littleGeniusAdventureQuests',
} as const;

export const AICS_KEYS = { progress: 'lgaAicsProgressV1', flag: 'lgaAicsMigrationV1' } as const;

export interface ItemProgress {
  completed?: boolean;
  ok?: number;
  wrong?: number;
  tries?: number;
  due?: string; // YYYY-MM-DD spaced-review date copied from the legacy record
}
export interface ProgressDoc {
  schema: 1;
  migratedAt: string;
  legacyKeysSeen: string[];
  activities: Record<string, Record<string, ItemProgress>>;
  skipped: number;
  issues: string[];
}
export type MigrationResult =
  | { status: 'migrated'; doc: ProgressDoc }
  | { status: 'already-migrated' }
  | { status: 'failed'; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1_000_000) : undefined);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readJson(storage: StorageLike, key: string, issues: string[], seen: string[]): Obj | null {
  let raw: string | null = null;
  try { raw = storage.getItem(key); } catch { issues.push('Could not read ' + key); return null; }
  if (raw === null) return null;
  seen.push(key);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isObj(parsed)) return parsed;
    issues.push(key + ' is not an object; ignored');
  } catch {
    issues.push(key + ' is not valid JSON; ignored');
  }
  return null;
}

const WORLD_TO_ACTIVITY: Record<string, string> = {
  phonics: 'act.lit.sounds', urdu: 'act.lit.urdu-letters', words: 'act.lit.words',
  shapes: 'act.spa.shapes', stories: 'act.lang.stories',
};
const WORLD_SIZE: Record<string, number> = { phonics: 10, urdu: 39, words: 8, shapes: 5, stories: 3 };
const LETTER_RE = /^[A-Za-z]$/;

function put(doc: ProgressDoc, activity: string, item: string, value: ItemProgress): void {
  (doc.activities[activity] ||= {})[item] = value;
}

/** Pure: builds the normalised document from parsed legacy data. Never touches storage. */
export function buildProgressDoc(storage: StorageLike, now: string): ProgressDoc {
  const doc: ProgressDoc = { schema: 1, migratedAt: now, legacyKeysSeen: [], activities: {}, skipped: 0, issues: [] };
  const read = (k: string): Obj | null => readJson(storage, k, doc.issues, doc.legacyKeysSeen);

  const abc = read(LEGACY_KEYS.abc);
  if (abc) for (const [k, v] of Object.entries(abc)) {
    if (LETTER_RE.test(k) && v === true) put(doc, 'act.lit.abc', 'letter:' + k.toUpperCase(), { completed: true });
    else doc.skipped++;
  }

  const cur = read(LEGACY_KEYS.curriculum);
  const records = cur && isObj(cur.records) ? cur.records : null;
  if (records) for (const [k, v] of Object.entries(records)) {
    const [world, idx] = k.split(':');
    const i = Number(idx);
    const act = WORLD_TO_ACTIVITY[world];
    if (!act || !Number.isInteger(i) || i < 0 || i >= WORLD_SIZE[world] || !isObj(v)) { doc.skipped++; continue; }
    const item: ItemProgress = {};
    const ok = num(v.ok), wrong = num(v.wrong), tries = num(v.tries);
    if (ok !== undefined) item.ok = ok;
    if (wrong !== undefined) item.wrong = wrong;
    if (tries !== undefined) item.tries = tries;
    if (typeof v.due === 'string' && DATE_RE.test(v.due)) item.due = v.due;
    put(doc, act, world + ':' + i, item);
  }

  const lost = read(LEGACY_KEYS.lost);
  if (lost && isObj(lost.completed)) for (const [k, v] of Object.entries(lost.completed)) {
    if (LETTER_RE.test(k) && v) put(doc, 'act.lit.lost-letters', 'letter:' + k.toUpperCase(), { completed: true });
    else doc.skipped++;
  }

  const pic = read(LEGACY_KEYS.picture);
  if (pic) for (const [k, v] of Object.entries(pic)) {
    if (k === 'last') continue;
    if (!LETTER_RE.test(k) || !isObj(v)) { doc.skipped++; continue; }
    const ok = num(v.success) ?? 0, wrong = num(v.wrong) ?? 0;
    put(doc, 'act.lit.picture-rescue', 'letter:' + k.toUpperCase(), { ok, wrong, tries: ok + wrong, completed: ok > 0 });
  }

  const quests = read(LEGACY_KEYS.quests);
  if (quests) for (const [k, v] of Object.entries(quests)) {
    if (v && k.length > 0 && k.length <= 64) put(doc, 'act.pat.quests', 'quest:' + k, { completed: true });
    else doc.skipped++;
  }
  return doc;
}

/**
 * One-time migration. Writes only the new keys; the flag is written last so an interrupted run is
 * simply repeated. Legacy keys are never removed or rewritten.
 */
export function migrate(storage: StorageLike, opts: { force?: boolean; now?: () => string } = {}): MigrationResult {
  try {
    if (!opts.force && storage.getItem(AICS_KEYS.flag) === '1') return { status: 'already-migrated' };
  } catch (e) {
    return { status: 'failed', error: String(e) };
  }
  const now = (opts.now ?? (() => new Date().toISOString()))();
  const doc = buildProgressDoc(storage, now);
  const check = validateProgressDoc(JSON.parse(JSON.stringify(doc)));
  if (!check.ok) return { status: 'failed', error: 'built document failed validation: ' + check.reason };
  try {
    storage.setItem(AICS_KEYS.progress, JSON.stringify(doc));
    storage.setItem(AICS_KEYS.flag, '1');
  } catch (e) {
    // Storage full or blocked mid-way: drop our own partial document (frees space) so no half-state remains.
    // Legacy keys are never touched here.
    try { storage.removeItem(AICS_KEYS.flag); storage.removeItem(AICS_KEYS.progress); } catch { /* best effort */ }
    return { status: 'failed', error: String(e) };
  }
  return { status: 'migrated', doc };
}

export interface LegacyDetection {
  valid: boolean; // true only if at least one legacy store parses to a plain object
  present: string[]; // legacy keys that exist
  usable: string[]; // legacy keys that parse to an object
  issues: string[];
}

/** Read-only check that real, parseable progress exists before any migration is attempted. */
export function detectLegacyStorage(storage: StorageLike): LegacyDetection {
  const out: LegacyDetection = { valid: false, present: [], usable: [], issues: [] };
  for (const key of Object.values(LEGACY_KEYS)) {
    let raw: string | null;
    try { raw = storage.getItem(key); } catch { out.issues.push('Could not read ' + key); continue; }
    if (raw === null) continue;
    out.present.push(key);
    try {
      if (isObj(JSON.parse(raw))) out.usable.push(key);
      else out.issues.push(key + ' is not an object');
    } catch {
      out.issues.push(key + ' is not valid JSON');
    }
  }
  out.valid = out.usable.length > 0;
  return out;
}

/** Raw legacy values, used to prove migration changed nothing. */
export function legacySnapshot(storage: StorageLike): Record<string, string | null> {
  const snap: Record<string, string | null> = {};
  for (const key of Object.values(LEGACY_KEYS)) {
    try { snap[key] = storage.getItem(key); } catch { snap[key] = null; }
  }
  return snap;
}

/**
 * Rollback: removes only AICS keys. Legacy keys stay exactly as they are, so the app behaves as
 * before and migration can be run again later. Never throws.
 */
export function resetAicsData(storage: StorageLike): { removed: string[]; errors: string[] } {
  const removed: string[] = [], errors: string[] = [];
  for (const key of [AICS_KEYS.flag, AICS_KEYS.progress]) {
    try { storage.removeItem(key); removed.push(key); } catch (e) { errors.push(key + ': ' + String(e)); }
  }
  return { removed, errors };
}
export const rollbackMigration = resetAicsData;

export const PROGRESS_SCHEMA_VERSION = 1;
const ITEM_FIELDS = new Set(['completed', 'ok', 'wrong', 'tries', 'due']);
const COUNTER = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const LEGACY_KEY_SET = new Set<string>(Object.values(LEGACY_KEYS));
const ACTIVITY_IDS = new Set(ACTIVITIES.map((a) => a.id));
const WORLD_OF_ACTIVITY: Record<string, string> = Object.fromEntries(Object.entries(WORLD_TO_ACTIVITY).map(([w, a]) => [a, w]));
const LETTER_ACTIVITIES = new Set(['act.lit.abc', 'act.lit.lost-letters', 'act.lit.picture-rescue']);
const ITEM_LETTER_RE = /^letter:[A-Z]$/;

function itemKeyOk(activity: string, key: string): boolean {
  if (LETTER_ACTIVITIES.has(activity)) return ITEM_LETTER_RE.test(key);
  if (activity === 'act.pat.quests') return key.startsWith('quest:') && key.length > 6 && key.length <= 70;
  const world = WORLD_OF_ACTIVITY[activity];
  if (!world) return false;
  const m = /^([a-z]+):(\d+)$/.exec(key);
  return !!m && m[1] === world && Number(m[2]) < WORLD_SIZE[world];
}

export type DocValidation = { ok: true; doc: ProgressDoc } | { ok: false; reason: string; versionMismatch?: boolean };

/** Strict runtime validation of a migrated document: schema, activities, item records and field types. */
export function validateProgressDoc(value: unknown): DocValidation {
  const bad = (reason: string, versionMismatch = false): DocValidation => ({ ok: false, reason, versionMismatch });
  if (!isObj(value)) return bad('document is not an object');
  if (value.schema !== PROGRESS_SCHEMA_VERSION) return bad('unsupported schema version: ' + String(value.schema), true);
  const allowed = new Set(['schema', 'migratedAt', 'legacyKeysSeen', 'activities', 'skipped', 'issues']);
  for (const k of Object.keys(value)) if (!allowed.has(k)) return bad('unexpected field: ' + k);
  if (typeof value.migratedAt !== 'string' || Number.isNaN(Date.parse(value.migratedAt))) return bad('migratedAt is not a valid date string');
  if (!Array.isArray(value.legacyKeysSeen) || !value.legacyKeysSeen.every((k) => typeof k === 'string' && LEGACY_KEY_SET.has(k))) return bad('legacyKeysSeen invalid');
  if (!COUNTER(value.skipped)) return bad('skipped is not a non-negative integer');
  if (!Array.isArray(value.issues) || !value.issues.every((i) => typeof i === 'string' && i.length <= 300)) return bad('issues invalid');
  if (!isObj(value.activities)) return bad('activities is not an object');
  for (const [act, items] of Object.entries(value.activities)) {
    if (!ACTIVITY_IDS.has(act)) return bad('unknown activity: ' + act);
    if (!isObj(items)) return bad('activity ' + act + ' is not an object');
    for (const [key, rec] of Object.entries(items)) {
      if (!itemKeyOk(act, key)) return bad('invalid item key ' + key + ' in ' + act);
      if (!isObj(rec)) return bad('item ' + act + '/' + key + ' is not an object');
      for (const [f, v] of Object.entries(rec)) {
        if (!ITEM_FIELDS.has(f)) return bad('unexpected item field: ' + f);
        if (f === 'completed' && typeof v !== 'boolean') return bad('completed must be boolean');
        if ((f === 'ok' || f === 'wrong' || f === 'tries') && !COUNTER(v)) return bad(f + ' must be a non-negative integer');
        if (f === 'due' && !(typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)))) return bad('due must be YYYY-MM-DD');
      }
    }
  }
  return { ok: true, doc: value as unknown as ProgressDoc };
}

/** Reads the stored document; returns null unless it passes strict validation. */
export function readProgressDoc(storage: StorageLike): ProgressDoc | null {
  const r = inspectProgressDoc(storage);
  return r.state === 'valid' ? r.doc : null;
}

export type DocInspection =
  | { state: 'missing' }
  | { state: 'valid'; doc: ProgressDoc }
  | { state: 'version-mismatch'; reason: string }
  | { state: 'invalid'; reason: string };

export function inspectProgressDoc(storage: StorageLike): DocInspection {
  let raw: string | null;
  try { raw = storage.getItem(AICS_KEYS.progress); } catch { return { state: 'invalid', reason: 'could not read document' }; }
  if (raw === null) return { state: 'missing' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { state: 'invalid', reason: 'document is not valid JSON' }; }
  const v = validateProgressDoc(parsed);
  if (v.ok) return { state: 'valid', doc: v.doc };
  return v.versionMismatch && isObj(parsed) && typeof parsed.schema === 'number' && parsed.schema > PROGRESS_SCHEMA_VERSION
    ? { state: 'version-mismatch', reason: v.reason }
    : { state: 'invalid', reason: v.reason };
}

export interface CompetencySummary { competencyId: string; itemsCompleted: number; itemsTried: number }

/** Derives per-competency counts through the activity catalogue. Attempts, not confirmed mastery. */
export function summarizeByCompetency(doc: ProgressDoc): CompetencySummary[] {
  const totals = new Map<string, CompetencySummary>();
  for (const act of ACTIVITIES) {
    const items = doc.activities[act.id];
    if (!items) continue;
    let completed = 0, tried = 0;
    for (const it of Object.values(items)) {
      const did = it.completed === true || (it.ok ?? 0) > 0;
      if (did) completed++;
      if (did || (it.tries ?? 0) > 0) tried++;
    }
    for (const cid of act.competencyIds) {
      const s = totals.get(cid) ?? { competencyId: cid, itemsCompleted: 0, itemsTried: 0 };
      s.itemsCompleted += completed;
      s.itemsTried += tried;
      totals.set(cid, s);
    }
  }
  return [...totals.values()].sort((a, b) => a.competencyId.localeCompare(b.competencyId));
}
