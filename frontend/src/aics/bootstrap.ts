import {
  AICS_KEYS, detectLegacyStorage, inspectProgressDoc, legacySnapshot, migrate, readProgressDoc, resetAicsData,
} from './progressService.ts';
import type { StorageLike } from './types.ts';

// Non-destructive integration point. Called once, deferred, after the learning app has rendered.
// It never throws, never modifies or deletes legacy keys, and never changes what a child sees.
// It DOES write the new AICS keys (lgaAicsProgressV1, lgaAicsMigrationV1) after legacy data is detected.

export const KILL_SWITCH_KEY = 'lgaAicsMigrationDisabled'; // set to '1' to turn migration off

export type BootstrapStatus =
  | 'disabled'
  | 'storage-unavailable'
  | 'already-migrated'
  | 'version-mismatch'
  | 'repaired'
  | 'no-valid-legacy-data'
  | 'migrated'
  | 'failed';
export interface BootstrapResult { status: BootstrapStatus; detail?: string }

export function safeLocalStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null; // blocked storage (privacy mode, disabled cookies)
  }
}

export function runAicsBootstrap(storage: StorageLike | null, opts: { now?: () => string } = {}): BootstrapResult {
  try {
    if (!storage) return { status: 'storage-unavailable' };
    if (storage.getItem(KILL_SWITCH_KEY) === '1') return { status: 'disabled' };

    const flagged = storage.getItem(AICS_KEYS.flag) === '1';
    const existing = inspectProgressDoc(storage);
    // A document written by a NEWER schema is never overwritten or removed.
    if (existing.state === 'version-mismatch') return { status: 'version-mismatch', detail: existing.reason };
    if (flagged && existing.state === 'valid') return { status: 'already-migrated' };
    // Flag missing but a valid document exists (interrupted before the flag): fall through and re-run, same result.

    // Only migrate when real, parseable progress exists. Nothing is written otherwise.
    const found = detectLegacyStorage(storage);
    if (!found.valid) return { status: 'no-valid-legacy-data', detail: found.issues.join('; ') || undefined };

    const before = legacySnapshot(storage);
    const result = migrate(storage, { force: flagged, now: opts.now }); // flagged but doc missing/corrupt => repair
    if (result.status === 'failed') return { status: 'failed', detail: result.error };
    if (result.status === 'already-migrated') return { status: 'already-migrated' };

    const after = legacySnapshot(storage);
    const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
    if (changed.length || !readProgressDoc(storage)) {
      resetAicsData(storage); // roll back our own keys only
      return { status: 'failed', detail: changed.length ? 'legacy values changed: ' + changed.join(',') : 'read-back failed' };
    }
    return { status: flagged ? 'repaired' : 'migrated' };
  } catch (e) {
    return { status: 'failed', detail: String(e) };
  }
}

let scheduled = false;
let last: BootstrapResult | null = null;
export const getLastBootstrapResult = (): BootstrapResult | null => last;
/** Test helper: lets a test schedule again. */
export function _resetBootstrapForTests(): void { scheduled = false; last = null; }

/** Defers the run so first paint and input are never delayed. Safe to call repeatedly. */
export function scheduleAicsBootstrap(opts: {
  delayMs?: number;
  storage?: StorageLike | null;
  schedule?: (fn: () => void, ms: number) => unknown;
} = {}): boolean {
  if (scheduled) return false;
  scheduled = true;
  const schedule = opts.schedule ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  try {
    schedule(() => {
      last = runAicsBootstrap(opts.storage === undefined ? safeLocalStorage() : opts.storage);
    }, opts.delayMs ?? 2000);
  } catch (e) {
    last = { status: 'failed', detail: String(e) };
  }
  return true;
}
