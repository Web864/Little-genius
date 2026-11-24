import { FRAMEWORKS, LEGACY_KEYS, PUBLISHED_CACHE_KEY, contentDigest } from '../../src/aics/index.ts';
import type { StorageLike } from '../../src/aics/index.ts';

export class MemStore implements StorageLike {
  data = new Map<string, string>();
  writes: string[] = [];
  removes: string[] = [];
  failAllWrites = false;
  failWriteNumber = 0; // 1-based: this setItem call throws (simulates a crash/quota mid-migration)
  failRemoves = false;
  throwOnGet = false;
  onSet: ((k: string, v: string, s: MemStore) => void) | null = null;
  private setCalls = 0;
  getItem(k: string): string | null {
    if (this.throwOnGet) throw new Error('SecurityError');
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.setCalls++;
    if (this.failAllWrites || this.setCalls === this.failWriteNumber) throw new Error('QuotaExceededError');
    this.writes.push(k);
    this.data.set(k, v);
    this.onSet?.(k, v, this);
  }
  removeItem(k: string): void {
    if (this.failRemoves) throw new Error('remove blocked');
    this.removes.push(k);
    this.data.delete(k);
  }
  get length(): number { return this.data.size; }
  key(i: number): string | null { return [...this.data.keys()][i] ?? null; }
  resetCounters(): void { this.writes = []; this.removes = []; }
}

export const FIXED_NOW = () => '2026-11-22T10:00:00.000Z';

export function legacyStore(): MemStore {
  const s = new MemStore();
  s.data.set(LEGACY_KEYS.abc, JSON.stringify({ A: true, B: true }));
  s.data.set(LEGACY_KEYS.curriculum, JSON.stringify({
    records: { 'phonics:0': { ok: 2, wrong: 1, tries: 3, due: '2026-11-25' }, 'urdu:3': { ok: 1, wrong: 0, tries: 1, due: '2026-11-23' } },
    daily: { date: '2026-11-22', step: 1, done: false },
  }));
  s.data.set(LEGACY_KEYS.lost, JSON.stringify({ current: 2, completed: { A: true } }));
  s.data.set(LEGACY_KEYS.picture, JSON.stringify({ last: 'B', A: { success: 1, wrong: 0 } }));
  s.data.set(LEGACY_KEYS.quests, JSON.stringify({ 'forest-quest': true }));
  s.data.set('littleGeniusLanguage', 'ur');
  s.data.set('littleGeniusTheme', 'space');
  s.data.set('littleGeniusSound', 'on');
  return s;
}

export const legacyRaw = (s: MemStore): string =>
  JSON.stringify([...s.data.entries()].filter(([k]) => k.startsWith('littleGenius')).sort());

/** What syncPublished would cache after the server published `ids` (default: every framework in this build). Test helper only. */
export const publishedCacheJson = (ids: readonly string[] = FRAMEWORKS.map((f) => f.id), fetchedAt = new Date().toISOString()): string =>
  JSON.stringify({ schema: 1, fetchedAt, entries: ids.map((frameworkId) => ({ frameworkId, version: '1', digest: contentDigest(frameworkId), publishedAt: fetchedAt })) });
export function markPublished(s: MemStore, ids?: readonly string[]): MemStore { s.data.set(PUBLISHED_CACHE_KEY, publishedCacheJson(ids)); return s; }
