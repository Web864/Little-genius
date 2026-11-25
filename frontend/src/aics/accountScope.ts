// Phase 7, priority 1: account isolation for a shared browser. Pure logic, no DOM.
// Problem: the live app keeps child progress and preferences in unscoped localStorage keys, so two signed-in accounts on one
// browser see and overwrite each other's data. Fix without editing every screen: keep exactly ONE account's data "live" at a
// time, and park every other account's data in a per-account vault entry. The identity is the server-verified user id from
// auth.getUser() (never the account type, role, school name, e-mail text or anything the user typed). Nothing leaves the device.
// Data is only ever COPIED to a verified vault entry before the live keys are cleared; nothing is deleted on logout, expiry or demo end.
// Phase 7a: data that no verified account owns (everything saved before isolation existed, or after a corrupted owner pointer) is NEVER
// assigned automatically. It is quarantined in a numbered slot and only an adult-confirmed claim can attach it to the signed-in account.
import { AICS_KEYS, LEGACY_KEYS } from './progressService.ts';
import { PROFILE_KEY, PROMPT_DISMISSED_KEY } from './onboardingService.ts';
import type { StorageLike } from './types.ts';

export const SCHOOL_DEFAULTS_CACHE_KEY = 'lgaAicsSchoolDefaultsV1';
export const ACTIVE_OWNER_KEY = 'lgaAicsActiveOwnerV1';
export const VAULT_PREFIX = 'lgaAicsVaultV1:';
export const JOURNAL_KEY = 'lgaAicsVaultJournalV1';
export const SIGNOUT_FAILED_KEY = 'lgaAicsSignoutFailedV1'; // set when sign-out could not park the data; cleared by the next safe activation

/** Everything that belongs to ONE account on this browser: child progress, per-child preferences, AICS data. */
export const ACCOUNT_DATA_KEYS: readonly string[] = [
  ...Object.values(LEGACY_KEYS), 'littleGeniusCourseComplete', 'lga_math_game_progress_v1',
  'littleGeniusLanguage', 'littleGeniusTheme', 'littleGeniusSound', 'littleGeniusSpeechPace',
  AICS_KEYS.progress, AICS_KEYS.flag, PROFILE_KEY, PROMPT_DISMISSED_KEY, SCHOOL_DEFAULTS_CACHE_KEY,
];
const DATA_KEY_SET = new Set(ACCOUNT_DATA_KEYS);
/** Keys that hold a child's saved progress. Preferences, the curriculum choice and the school cache are not progress. */
export const PROGRESS_KEYS: readonly string[] = [...Object.values(LEGACY_KEYS), 'littleGeniusCourseComplete', 'lga_math_game_progress_v1', AICS_KEYS.progress, AICS_KEYS.flag];

export type ScopeFailure = 'no-identity' | 'storage-unavailable' | 'stash-failed' | 'clear-failed' | 'restore-failed' | 'pointer-failed';
export type ScopeResult =
  | { ok: true; owner: string; action: 'new' | 'unchanged' | 'switched' | 'restored' | 'recovered'; quarantined: string | null }
  | { ok: false; reason: ScopeFailure; detail?: string };

/** Stable, non-reversible storage id for a verified user id. The raw id and e-mail never appear in a key or value. */
export async function ownerKey(userId: unknown): Promise<string | null> {
  if (typeof userId !== 'string') return null;
  const id = userId.trim();
  if (!id || id.length > 200) return null;
  const bytes = new TextEncoder().encode('lga-aics-owner|' + id);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'o' + Array.from(new Uint8Array(digest)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const vaultKey = (owner: string): string => VAULT_PREFIX + owner;
type Snapshot = Record<string, string>;
const QSLOT = /^q(?:[1-9]|1\d|20)$/;
const OWNER_RE = /^(o[0-9a-f]{32}|q(?:[1-9]|1\d|20))$/;
const MAX_SLOTS = 20;

function readLive(s: StorageLike): Snapshot {
  const out: Snapshot = {};
  for (const k of ACCOUNT_DATA_KEYS) { const v = s.getItem(k); if (v !== null) out[k] = v; }
  return out;
}
function parseVault(raw: string | null): Snapshot | null {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const out: Snapshot = {};
    for (const [k, val] of Object.entries(v)) { if (!DATA_KEY_SET.has(k) || typeof val !== 'string') return null; out[k] = val; }
    return out;
  } catch { return null; }
}
type Journal = { from: string | null; to: string | null };
function readJournal(s: StorageLike): Journal | 'corrupt' | null {
  const raw = s.getItem(JOURNAL_KEY);
  if (raw === null) return null;
  try {
    const j = JSON.parse(raw) as { step?: unknown; from?: unknown; to?: unknown };
    const ok = (x: unknown): x is string | null => x === null || (typeof x === 'string' && OWNER_RE.test(x));
    if (j.step === 'cleared' && ok(j.from) && ok(j.to)) return { from: j.from, to: j.to };
  } catch { /* fall through */ }
  return 'corrupt';
}
/** Copy to a vault slot and read it back. Throws if the copy cannot be verified. Never removes anything. */
function stash(s: StorageLike, slot: string, snapshot: Snapshot): void {
  const text = JSON.stringify(snapshot);
  s.setItem(vaultKey(slot), text);
  if (s.getItem(vaultKey(slot)) !== text) throw new Error('read-back mismatch');
}
/** A free numbered quarantine slot, or the slot that already holds exactly this data. Null when all slots are used. */
function quarantineSlot(s: StorageLike, snapshot: Snapshot): string | null {
  const text = JSON.stringify(snapshot);
  let free: string | null = null;
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const cur = s.getItem(vaultKey('q' + i));
    if (cur === text) return 'q' + i;
    if (cur === null && free === null) free = 'q' + i;
  }
  return free;
}
function clearLive(s: StorageLike): boolean {
  for (const k of ACCOUNT_DATA_KEYS) { try { s.removeItem(k); } catch { /* verified below */ } }
  return Object.keys(readLive(s)).length === 0;
}
function putBack(s: StorageLike, snapshot: Snapshot): void { for (const [k, v] of Object.entries(snapshot)) { try { s.setItem(k, v); } catch { /* best effort */ } } }

/**
 * Make `userId`'s data the live data of this browser. Safe to call on every start.
 *  - data owned by another verified account is copied to that account's vault entry and read back before live keys are cleared;
 *  - data that NO account owns is QUARANTINED, never assigned (existing users keep it; an adult claims it with claimQuarantine);
 *  - any failure leaves the previous data intact (copy first, delete later) and returns ok:false, so the caller does not mount the learning screens;
 *  - an interrupted switch is journaled and finished on the next start; an unreadable journal quarantines whatever is live.
 */
export async function activateAccount(storage: StorageLike | null, userId: unknown): Promise<ScopeResult> {
  if (!storage) return { ok: false, reason: 'storage-unavailable' };
  const id = await ownerKey(userId);
  if (!id) return { ok: false, reason: 'no-identity' };
  try {
    let journal = readJournal(storage);
    const rawActive = storage.getItem(ACTIVE_OWNER_KEY);
    let active = rawActive !== null && OWNER_RE.test(rawActive) && !QSLOT.test(rawActive) ? rawActive : null; // a corrupted or foreign pointer means "no owner"
    let quarantined: string | null = null;

    if (journal === 'corrupt') {
      // Unknown state. Whatever is live is quarantined (copy verified), the unreadable journal is dropped, and nobody is assumed to own anything.
      const live = readLive(storage);
      if (Object.keys(live).length) {
        const slot = quarantineSlot(storage, live);
        if (!slot) return { ok: false, reason: 'stash-failed', detail: 'quarantine is full' };
        try { stash(storage, slot, live); } catch (e) { return { ok: false, reason: 'stash-failed', detail: String(e) }; }
        quarantined = slot;
        if (!clearLive(storage)) return { ok: false, reason: 'clear-failed', detail: 'live data could not be cleared' };
      }
      try { storage.removeItem(JOURNAL_KEY); } catch (e) { return { ok: false, reason: 'clear-failed', detail: String(e) }; }
      journal = null; active = null;
    }

    if (journal && rawActive === journal.to) {
      // The previous switch finished (pointer set) and only its journal cleanup failed. The live data now belongs to `to`: never clear it.
      try { storage.removeItem(JOURNAL_KEY); } catch (e) { return { ok: false, reason: 'clear-failed', detail: String(e) }; }
      if (storage.getItem(JOURNAL_KEY) !== null) return { ok: false, reason: 'clear-failed', detail: 'journal not removed' };
      journal = null; active = rawActive !== null && OWNER_RE.test(rawActive) && !QSLOT.test(rawActive) ? rawActive : null;
    }

    const hasLive = Object.keys(readLive(storage)).length > 0;
    if (journal === null && active === id && quarantined === null) return { ok: true, owner: id, action: 'unchanged', quarantined: null };
    const hadVault = storage.getItem(vaultKey(id)) !== null;
    if (journal === null && active === null && !hasLive && !hadVault) {
      storage.setItem(ACTIVE_OWNER_KEY, id);
      return storage.getItem(ACTIVE_OWNER_KEY) === id ? { ok: true, owner: id, action: 'new', quarantined } : { ok: false, reason: 'pointer-failed' };
    }

    const interrupted = journal !== null; // a verified copy and a journal already exist; clearing is idempotent
    if (!interrupted && hasLive) {
      const snapshot = readLive(storage);
      const slot = active ?? quarantineSlot(storage, snapshot);
      if (!slot) return { ok: false, reason: 'stash-failed', detail: 'quarantine is full' };
      try { stash(storage, slot, snapshot); } catch (e) { return { ok: false, reason: 'stash-failed', detail: String(e) }; }
      if (!active) quarantined = slot;
      try { storage.setItem(JOURNAL_KEY, JSON.stringify({ step: 'cleared', from: slot, to: id })); } catch (e) { return { ok: false, reason: 'stash-failed', detail: String(e) }; }
    }

    if (!clearLive(storage)) return { ok: false, reason: 'clear-failed', detail: 'live data could not be cleared' };

    const incoming = parseVault(storage.getItem(vaultKey(id)));
    if (hadVault && incoming === null) return { ok: false, reason: 'restore-failed', detail: 'vault entry unreadable; left untouched' };
    if (incoming) {
      try { for (const [k, v] of Object.entries(incoming)) { storage.setItem(k, v); if (storage.getItem(k) !== v) throw new Error('read-back mismatch'); } } catch (e) {
        for (const k of Object.keys(incoming)) { try { storage.removeItem(k); } catch { /* best effort */ } }
        return { ok: false, reason: 'restore-failed', detail: String(e) };
      }
    }
    storage.setItem(ACTIVE_OWNER_KEY, id);
    if (storage.getItem(ACTIVE_OWNER_KEY) !== id) return { ok: false, reason: 'pointer-failed' };
    try { if (hadVault) storage.removeItem(vaultKey(id)); } catch { /* a stale copy is overwritten at the next stash and never auto-restored */ }
    try { storage.removeItem(JOURNAL_KEY); } catch { /* a leftover journal is re-run safely */ }
    try { storage.removeItem(SIGNOUT_FAILED_KEY); } catch { /* informational only */ }
    return { ok: true, owner: id, action: interrupted ? 'recovered' : hadVault ? 'restored' : 'switched', quarantined };
  } catch (e) {
    return { ok: false, reason: 'storage-unavailable', detail: String(e) };
  }
}

/**
 * Park the active account's data in its vault and leave no child data live. Never deletes: the copy is verified first, and if anything
 * after the copy fails the live data is put back exactly as it was (so the account never sees a half-emptied state).
 */
export async function parkAccount(storage: StorageLike | null): Promise<{ ok: boolean; reason?: string }> {
  let snapshot: Snapshot = {};
  try {
    if (!storage) return { ok: false, reason: 'storage-unavailable' };
    const active = storage.getItem(ACTIVE_OWNER_KEY);
    if (!active || !OWNER_RE.test(active) || QSLOT.test(active) || readJournal(storage) !== null) return { ok: false, reason: 'nothing-to-park' };
    snapshot = readLive(storage);
    stash(storage, active, snapshot);
    if (!clearLive(storage)) { clearLive(storage); putBack(storage, snapshot); return { ok: false, reason: 'live-not-cleared' }; }
    try { storage.removeItem(ACTIVE_OWNER_KEY); } catch { putBack(storage, snapshot); return { ok: false, reason: 'pointer-not-cleared' }; }
    if (storage.getItem(ACTIVE_OWNER_KEY) !== null) { putBack(storage, snapshot); return { ok: false, reason: 'pointer-not-cleared' }; }
    return { ok: true };
  } catch (e) {
    try { if (storage && Object.keys(snapshot).length && Object.keys(readLive(storage)).length < Object.keys(snapshot).length) putBack(storage, snapshot); } catch { /* best effort */ }
    return { ok: false, reason: String(e) };
  }
}

/**
 * Sign-out on a shared device. proceed:false means the data could NOT be put away: the caller must say so and not pretend isolation succeeded.
 * Even if the user then chooses to sign out anyway, the next account cannot see this data: activateAccount copies it away first or refuses to mount.
 */
export async function signOutSafely(storage: StorageLike | null): Promise<{ proceed: boolean; reason?: string }> {
  try {
    if (!storage) return { proceed: true };
    const active = storage.getItem(ACTIVE_OWNER_KEY);
    if (!active) return { proceed: true }; // no owner: any live data is quarantined by the next sign-in
    let r = await parkAccount(storage);
    if (!r.ok && r.reason !== 'nothing-to-park') r = await parkAccount(storage); // one retry
    if (r.ok) return { proceed: true };
    if (r.reason === 'nothing-to-park') return { proceed: false, reason: 'an earlier account switch was interrupted' };
    try { storage.setItem(SIGNOUT_FAILED_KEY, active); } catch { /* informational */ }
    return { proceed: false, reason: r.reason };
  } catch (e) {
    return { proceed: false, reason: String(e) };
  }
}

// ---- quarantine and adult-confirmed claim -----------------------------------------------------------------------------------------
export interface QuarantineSlot { slot: string; keys: number; progressKeys: number; hasProfile: boolean }
/** Counts only. Never returns the data itself. */
export function listQuarantine(storage: StorageLike | null): QuarantineSlot[] {
  const out: QuarantineSlot[] = [];
  if (!storage) return out;
  for (let i = 1; i <= MAX_SLOTS; i++) {
    try {
      const raw = storage.getItem(vaultKey('q' + i));
      if (raw === null) continue;
      const snap = parseVault(raw);
      out.push(snap ? { slot: 'q' + i, keys: Object.keys(snap).length, progressKeys: PROGRESS_KEYS.filter((k) => k in snap).length, hasProfile: PROFILE_KEY in snap } : { slot: 'q' + i, keys: 0, progressKeys: 0, hasProfile: false });
    } catch { /* skip unreadable */ }
  }
  return out;
}
export const hasQuarantine = (storage: StorageLike | null): boolean => listQuarantine(storage).length > 0;

export type ClaimResult =
  | { ok: true; restoredKeys: number; keptOwnKeys: string[] }
  | { ok: false; reason: 'not-confirmed' | 'no-identity' | 'not-active' | 'busy' | 'no-such-slot' | 'unreadable' | 'would-mix' | 'restore-failed' | 'storage-unavailable' };

/**
 * Attach a quarantined set of data to the signed-in account. Requires `adultConfirmed: true`, which only the UI may pass after the app's
 * grown-up gate and an explicit confirmation. Refuses (changes nothing) if the account already has progress, so records are never mixed.
 * The quarantine slot is removed only after every key is written and read back.
 */
export async function claimQuarantine(storage: StorageLike | null, userId: unknown, slot: string, confirmation: { adultConfirmed: boolean }): Promise<ClaimResult> {
  if (!storage) return { ok: false, reason: 'storage-unavailable' };
  if (!confirmation || confirmation.adultConfirmed !== true) return { ok: false, reason: 'not-confirmed' };
  const id = await ownerKey(userId);
  if (!id) return { ok: false, reason: 'no-identity' };
  try {
    if (storage.getItem(ACTIVE_OWNER_KEY) !== id) return { ok: false, reason: 'not-active' }; // only the account that is live right now
    if (readJournal(storage) !== null) return { ok: false, reason: 'busy' };
    if (!QSLOT.test(slot)) return { ok: false, reason: 'no-such-slot' };
    const raw = storage.getItem(vaultKey(slot));
    if (raw === null) return { ok: false, reason: 'no-such-slot' };
    const snap = parseVault(raw);
    if (!snap) return { ok: false, reason: 'unreadable' };
    const live = readLive(storage);
    if (PROGRESS_KEYS.some((k) => k in live)) return { ok: false, reason: 'would-mix' };
    const written: string[] = []; const kept: string[] = [];
    try {
      for (const [k, v] of Object.entries(snap)) {
        if (k in live) { kept.push(k); continue; } // the account's own preference / curriculum choice is never overwritten
        storage.setItem(k, v); written.push(k);
        if (storage.getItem(k) !== v) throw new Error('read-back mismatch');
      }
    } catch {
      for (const k of written) { try { storage.removeItem(k); } catch { /* best effort */ } }
      return { ok: false, reason: 'restore-failed' };
    }
    try { storage.removeItem(vaultKey(slot)); } catch { /* a leftover slot only means the adult can see the prompt again; the next claim will report would-mix */ }
    return { ok: true, restoredKeys: written.length, keptOwnKeys: kept };
  } catch { return { ok: false, reason: 'storage-unavailable' }; }
}

export interface StorageEventTarget { addEventListener(type: 'storage', fn: (e: { key: string | null; newValue: string | null }) => void): void }
/** Another tab signed a different account in. This tab must stop using the shared keys and ask for a reload. */
export function watchAccountConflict(target: StorageEventTarget, myOwner: string, onConflict: () => void): void {
  target.addEventListener('storage', (e) => {
    if (e.key === ACTIVE_OWNER_KEY && e.newValue !== myOwner) onConflict();
    if (e.key === null) onConflict(); // storage.clear() in another tab
  });
}

/** Counts only: for the Parent Corner and tests. Never returns another account's data. */
export function describeAccounts(storage: StorageLike): { activeOwnerSet: boolean; parkedAccounts: number } {
  let parked = 0;
  const s = storage as StorageLike & { length?: number; key?: (i: number) => string | null };
  if (typeof s.length === 'number' && typeof s.key === 'function') {
    for (let i = 0; i < s.length; i++) if (s.key(i)?.startsWith(VAULT_PREFIX) && !QSLOT.test(s.key(i)!.slice(VAULT_PREFIX.length))) parked++;
  }
  return { activeOwnerSet: storage.getItem(ACTIVE_OWNER_KEY) !== null, parkedAccounts: parked };
}
