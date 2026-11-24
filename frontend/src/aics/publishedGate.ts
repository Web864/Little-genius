import { contentDigest } from './packRelease.ts';
import { resolveProfile } from './countryRegistry.ts';
import type { AdultProfile } from './onboardingService.ts';
import type { StorageLike } from './types.ts';

// Phase 8 child-facing gate. The learning screens personalise (and school defaults apply) ONLY for packs the owner has published.
// Server side the manifest already excludes anything unpublished, failing a gate, or not matching its approved digest. Here the client
// repeats the digest check against the pack compiled into THIS build, so a stale cache, a changed pack or a tampered cache entry
// fails closed to the app's original screens. The cache holds no personal data and is browser-level (shared by every account).

export const PUBLISHED_CACHE_KEY = 'lgaAicsPublishedV1';
export const REVOKED_KEY = 'lgaAicsRevokedV1'; // browser-level, never cleared by sign-out: a revoked pack stays revoked on this device
export const MAX_REVOKED_KEPT = 500;
export const PUBLISHED_MAX_AGE_MS = 24 * 3600 * 1000; // Phase 10 policy: an offline device keeps published content for 24 hours after its last good sync, never longer
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // a clock that runs this far behind the last sync fails closed
export interface ManifestEntry { frameworkId: string; version: string; digest: string; publishedAt: string }
export interface PublishedApi { get(url: string): Promise<{ data: unknown }> }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const DIGEST_RE = /^[0-9a-f]{64}$/;

export function parseManifest(data: unknown): ManifestEntry[] | null {
  if (!isObj(data) || !Array.isArray(data.published) || data.published.length > 50) return null;
  const out: ManifestEntry[] = [];
  for (const e of data.published) {
    if (!isObj(e) || typeof e.frameworkId !== 'string' || typeof e.version !== 'string' || typeof e.digest !== 'string' || !DIGEST_RE.test(e.digest) || typeof e.publishedAt !== 'string') return null;
    out.push({ frameworkId: e.frameworkId, version: e.version, digest: e.digest, publishedAt: e.publishedAt });
  }
  return out;
}

/** Revoked digests reported by the server. A manifest without the field (older server) means none. Malformed entries make the whole list unusable (null). */
export function parseRevoked(data: unknown): string[] | null {
  if (!isObj(data)) return null;
  if (data.revoked === undefined) return [];
  if (!Array.isArray(data.revoked) || data.revoked.length > 500) return null;
  return data.revoked.every((d) => typeof d === 'string' && DIGEST_RE.test(d)) ? (data.revoked as string[]) : null;
}

/** Digests this device has ever been told are revoked (newest last, capped). Reading never throws. */
export function readRevoked(storage: StorageLike | null): Set<string> {
  try {
    const raw = storage?.getItem(REVOKED_KEY); if (!raw) return new Set();
    const d: unknown = JSON.parse(raw);
    return new Set(Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string' && DIGEST_RE.test(x)) : []);
  } catch { return new Set(); }
}
function rememberRevoked(storage: StorageLike, incoming: string[]): void {
  const have = [...readRevoked(storage)];
  const merged = [...have.filter((d) => !incoming.includes(d)), ...incoming].slice(-MAX_REVOKED_KEPT); // union; revocations are never un-learned
  try { storage.setItem(REVOKED_KEY, JSON.stringify(merged)); } catch { /* cannot persist: this sync still applies it to the cache below */ }
}

/** Fetch the manifest and cache the entries that match the packs in this build. Returns what happened; never throws. */
export async function syncPublished(api: PublishedApi, storage: StorageLike | null, now: () => number = Date.now): Promise<'updated' | 'kept' | 'cleared'> {
  if (!storage) return 'cleared';
  try {
    const r = await api.get('/api/curriculum/published');
    const list = parseManifest(r.data);
    const revokedNow = list ? parseRevoked(r.data) : null;
    if (revokedNow === null && list) { try { storage.removeItem(PUBLISHED_CACHE_KEY); } catch { /* ignore */ } return 'cleared'; } // unreadable revocation list: fail closed
    if (revokedNow && revokedNow.length) rememberRevoked(storage, revokedNow);
    if (!list) { try { storage.removeItem(PUBLISHED_CACHE_KEY); } catch { /* ignore */ } return 'cleared'; }
    const blocked = new Set([...readRevoked(storage), ...(revokedNow ?? [])]);
    const entries = list.filter((e) => contentDigest(e.frameworkId) === e.digest && !blocked.has(e.digest));
    storage.setItem(PUBLISHED_CACHE_KEY, JSON.stringify({ schema: 1, fetchedAt: new Date(now()).toISOString(), entries }));
    return 'updated';
  } catch {
    return 'kept'; // offline or server error: the age limit still applies
  }
}

/** Framework ids that may reach children right now. Re-verifies every cached digest against this build. */
export function publishedFrameworkIds(storage: StorageLike | null, now: () => number = Date.now): Set<string> {
  const out = new Set<string>();
  try {
    const raw = storage?.getItem(PUBLISHED_CACHE_KEY);
    if (!raw) return out;
    const d: unknown = JSON.parse(raw);
    if (!isObj(d) || d.schema !== 1 || typeof d.fetchedAt !== 'string' || !Array.isArray(d.entries)) return out;
    const age = now() - Date.parse(d.fetchedAt);
    if (!Number.isFinite(age) || age < -CLOCK_SKEW_TOLERANCE_MS || age > PUBLISHED_MAX_AGE_MS) return out;
    const revoked = readRevoked(storage);
    for (const e of d.entries) {
      if (isObj(e) && typeof e.frameworkId === 'string' && typeof e.digest === 'string' && contentDigest(e.frameworkId) === e.digest && !revoked.has(e.digest)) out.add(e.frameworkId);
    }
  } catch { /* fail closed */ }
  return out;
}

/** True only when the base framework and every overlay of this profile are published. Otherwise the app keeps its original screens. */
export function profilePublished(profile: AdultProfile | null, storage: StorageLike | null, now: () => number = Date.now): boolean {
  if (!profile) return false;
  const resolved = resolveProfile({ countryCode: profile.countryCode, frameworkId: profile.frameworkId });
  const ids = publishedFrameworkIds(storage, now);
  return [resolved.baseFrameworkId, ...resolved.overlayIds].every((id) => ids.has(id));
}

export function clearPublishedCache(storage: StorageLike | null): void { try { storage?.removeItem(PUBLISHED_CACHE_KEY); } catch { /* ignore */ } }

export interface ResyncOptions { intervalMs?: number; minGapMs?: number; now?: () => number; doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>; win?: Pick<Window, 'addEventListener' | 'removeEventListener'>; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void }

/**
 * Keep the manifest fresh so an emergency revoke reaches an open app quickly: sync now, when the tab becomes visible, when the network
 * returns, and about every 30 minutes. Syncs are rate-limited (default 60 s apart). Returns stop(). Never throws.
 * An app that stays OFFLINE cannot learn of a revoke: it keeps showing personalised screens for at most PUBLISHED_MAX_AGE_MS (24 hours after its last successful sync). Offline revocation can never be immediate.
 */
let stopPrevious: (() => void) | null = null; // the app calls this from showApp, which can run more than once: never stack timers or listeners
export function startPublishedResync(api: PublishedApi, storage: StorageLike | null, o: ResyncOptions = {}): () => void {
  try { stopPrevious?.(); } catch { /* ignore */ }
  const now = o.now ?? Date.now; const gap = o.minGapMs ?? 60_000; let last = -Infinity; let stopped = false;
  const doc = o.doc ?? (typeof document !== 'undefined' ? document : undefined); const win = o.win ?? (typeof window !== 'undefined' ? window : undefined);
  const setT = o.setTimer ?? ((fn, ms) => setInterval(fn, ms)); const clearT = o.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  const run = (): void => { if (stopped) return; const t = now(); if (t - last < gap) return; last = t; void syncPublished(api, storage, now).catch(() => undefined); };
  const onVis = (): void => { if (doc?.visibilityState === 'visible') run(); };
  try { doc?.addEventListener('visibilitychange', onVis); win?.addEventListener('online', run); win?.addEventListener('focus', run); } catch { /* optional */ }
  const timer = setT(run, o.intervalMs ?? 30 * 60_000);
  run();
  const stop = (): void => { if (stopPrevious === stop) stopPrevious = null; stopped = true; try { doc?.removeEventListener('visibilitychange', onVis); win?.removeEventListener('online', run); win?.removeEventListener('focus', run); clearT(timer); } catch { /* ignore */ } };
  stopPrevious = stop;
  return stop;
}
