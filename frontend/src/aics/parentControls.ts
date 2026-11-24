// Phase 7, priority 2: Parent Corner controls. Pure logic; the confirmations and the grown-up gate stay in the existing screens.
// Two separate actions, deliberately sharing no code path:
//   Reset progress               -> removes the derived AICS progress record, then rebuilds it from whatever legacy progress is left.
//   Reset curriculum preferences -> removes the curriculum/language choice and the Parent Corner prompt flag. Never touches progress.
// Both act on the ACTIVE account's live keys only. Other accounts' vault entries are never read, listed or written here.
import { runAicsBootstrap } from './bootstrap.ts';
import type { BootstrapStatus } from './bootstrap.ts';
import { clearOnboardingData } from './onboardingService.ts';
import { AICS_KEYS, resetAicsData } from './progressService.ts';
import type { StorageLike } from './types.ts';

export const PROGRESS_CHANGED_EVENT = 'lga-parent-progress-changed'; // already fired by the app's own "Reset new-world records" button

export interface ResetResult { removed: string[]; errors: string[]; rederived: BootstrapStatus | null }

/** Removes only lgaAicsProgressV1 and lgaAicsMigrationV1, then lets the migration rebuild them from the legacy keys that remain. Never throws. */
export function resetAicsProgress(storage: StorageLike | null, opts: { now?: () => string } = {}): ResetResult {
  if (!storage) return { removed: [], errors: ['storage unavailable'], rederived: null };
  const r = resetAicsData(storage);
  let rederived: BootstrapStatus | null = null;
  if (!r.errors.length) { try { rederived = runAicsBootstrap(storage, opts).status; } catch { rederived = 'failed'; } }
  return { removed: r.removed, errors: r.errors, rederived };
}

/** Removes only the curriculum/language choice and the Parent Corner prompt flag. Learning progress is not touched. Never throws. */
export function resetCurriculumPreferences(storage: StorageLike | null): ResetResult {
  if (!storage) return { removed: [], errors: ['storage unavailable'], rederived: null };
  return { ...clearOnboardingData(storage), rederived: null };
}

export const PROGRESS_KEYS_TOUCHED: readonly string[] = [AICS_KEYS.progress, AICS_KEYS.flag];

export interface EventTargetLike { addEventListener(type: string, fn: () => void): void }
/**
 * Wire AICS progress to the app's existing reset buttons. The app fires the event only AFTER its own grown-up confirmation was accepted
 * and its own data was cleared, so the existing gates and confirmations are unchanged. Installing twice has no extra effect.
 */
const installed = new WeakSet<object>();
export function installProgressResetBridge(target: EventTargetLike, getStorage: () => StorageLike | null, onDone?: (r: ResetResult) => void): boolean {
  if (installed.has(target)) return false;
  installed.add(target);
  target.addEventListener(PROGRESS_CHANGED_EVENT, () => {
    try { const r = resetAicsProgress(getStorage()); onDone?.(r); } catch { /* never disturb the app */ }
  });
  return true;
}
