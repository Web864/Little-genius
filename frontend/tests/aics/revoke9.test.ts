import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PUBLISHED_CACHE_KEY, PUBLISHED_MAX_AGE_MS, REVOKED_KEY, contentDigest, curriculumManifest, listOwnerPacks, ownerAction, parseRevoked, profilePublished, publishedFrameworkIds,
  publishedManifest, readRevoked, startPublishedResync, syncPublished,
} from '../../src/aics/index.ts';
import type { AdultProfile, Release } from '../../src/aics/index.ts';
import { GOOD_ACT, Ledger, OWNER, world } from './ledger.ts';
import { MemStore } from './helpers.ts';

// Phase 9: emergency curriculum revocation. Server rules, client enforcement, offline risk (Phase 10: 24-hour cache), re-sync triggers.
const act = (l: Ledger, action: string, body: Record<string, unknown>, caller = OWNER) => ownerAction(caller, action, () => body, l);
const rel = (l: Ledger): Release => l.releases.get('fx-pack@1.0')!;
const step = (l: Ledger, a: string, extra: Record<string, unknown> = {}) => act(l, a, { releaseId: rel(l).id, expectedRev: rel(l).rev, ...extra });
async function toPublished(l: Ledger): Promise<void> {
  await act(l, 'create', { frameworkId: 'fx-pack' });
  await act(l, 'review', { releaseId: rel(l).id, expectedRev: rel(l).rev, role: 'educator', reviewer: 'A. Teacher', note: 'checked' });
  await step(l, 'submit'); await step(l, 'approve'); const p = await step(l, 'publish'); assert.ok(p.ok, JSON.stringify(p));
}
const D = (l: Ledger) => contentDigest('fx-pack', l.w)!;
const REVOKE = { frameworkId: 'fx-pack', reason: 'wrong content found' };

test('revoke: owner only, authorization before the body is read, reason required, unknown framework refused', async () => {
  const l = new Ledger(world()); await toPublished(l); let reads = 0;
  for (const c of [null, { userId: 'u' }, { userId: 'u', role: 'admin' }, { userId: 'u', role: 'staff' }, { userId: 'u', role: 'licensee' }, { userId: 'u', role: 'OWNER' }, { userId: '', role: 'owner' }]) {
    const r = await ownerAction(c as never, 'revoke', () => { reads++; return REVOKE; }, l); assert.equal(r.ok, false);
  }
  assert.equal(reads, 0); assert.equal(l.revocations.size, 0); assert.equal(l.current.size, 1);
  for (const reason of [undefined, '', '  ', 'ab', 'x'.repeat(201), 5]) assert.equal((await act(l, 'revoke', { frameworkId: 'fx-pack', reason })).ok, false, String(reason));
  assert.equal((await act(l, 'revoke', { frameworkId: 'nope', reason: 'valid reason' })).ok, false);
  assert.equal(l.revocations.size, 0, 'nothing written by any refused call');
});

test('revoke from a published release: pointer cleared, release archived with the reason, revocation + audit written in ONE commit', async () => {
  const l = new Ledger(world()); await toPublished(l); const c0 = l.commits; const a0 = l.audit.length;
  assert.equal((await publishedManifest(l)).length, 1);
  const r = await act(l, 'revoke', REVOKE); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(l.commits, c0 + 1); assert.equal(l.current.size, 0);
  assert.equal(rel(l).state, 'archived'); assert.match(rel(l).archiveReason ?? '', /^REVOKED: wrong content found/);
  assert.equal(l.revocations.get(D(l))?.reason, 'wrong content found'); assert.equal(l.revocations.get(D(l))?.by, 'u-owner');
  assert.equal(l.audit.length, a0 + 1); assert.match(l.audit.at(-1)!.detail, /EMERGENCY REVOKE/);
  const m = await curriculumManifest(l); assert.deepEqual(m.published, []); assert.deepEqual(m.revoked, [D(l)]);
});

test('revoke works from every state, including with nothing released yet (blocks the digest in advance)', async () => {
  const l = new Ledger(world()); assert.ok((await act(l, 'revoke', REVOKE)).ok);
  assert.equal(l.revocations.size, 1); assert.equal(l.current.size, 0);
  const c = await act(l, 'create', { frameworkId: 'fx-pack' }); assert.ok(c.ok);
  await act(l, 'review', { releaseId: rel(l).id, expectedRev: rel(l).rev, role: 'educator', reviewer: 'A. Teacher', note: 'x' }); await step(l, 'submit');
  const ap = await step(l, 'approve'); assert.equal(ap.ok, false); assert.equal(!ap.ok && ap.status, 409, 'revoked content can never be approved');
});

test('a revoked digest can never be published or rolled back to; a content fix (new digest) can start over', async () => {
  const l = new Ledger(world()); await toPublished(l); await act(l, 'revoke', REVOKE);
  const rb = await step(l, 'rollback'); assert.equal(rb.ok, false); assert.equal(!rb.ok && rb.status, 409); assert.match(!rb.ok ? rb.error : '', /revoked/);
  assert.equal(l.current.size, 0); assert.equal((await publishedManifest(l)).length, 0);
  // approved release whose digest is revoked after approval cannot be published
  const l2 = new Ledger(world()); await act(l2, 'create', { frameworkId: 'fx-pack' });
  await act(l2, 'review', { releaseId: rel(l2).id, expectedRev: rel(l2).rev, role: 'educator', reviewer: 'A', note: 'x' }); await step(l2, 'submit'); await step(l2, 'approve');
  await act(l2, 'revoke', REVOKE); const pub = await step(l2, 'publish'); assert.equal(pub.ok, false); assert.equal(!pub.ok && pub.status, 409);
  // changed content = new digest = not covered by the old revocation
  const fixed = world({ acts: [{ ...GOOD_ACT, ageBands: [...GOOD_ACT.ageBands] }], rows: undefined }); fixed.mappings = fixed.mappings.map((m, i) => (i === 0 ? { ...m, note: 'Corrected note.' } : m));
  assert.notEqual(contentDigest('fx-pack', fixed), D(l));
  l.w = fixed; assert.equal((await listOwnerPacks(OWNER, l)).ok, true);
  const packs = await listOwnerPacks(OWNER, l); assert.ok(packs.ok && packs.packs[0].revoked === false, 'the fixed content is not revoked');
});

test('manifest filters a revoked digest even if the current pointer still lists it (publish racing the revoke): defence in depth', async () => {
  const l = new Ledger(world()); await toPublished(l); assert.equal((await publishedManifest(l)).length, 1);
  l.revocations.set(D(l), { digest: D(l), frameworkId: 'fx-pack', at: 'now', by: 'u-owner', reason: 'race' }); // pointer untouched
  assert.deepEqual(await publishedManifest(l), []); const m = await curriculumManifest(l); assert.deepEqual(m.revoked, [D(l)]);
});

test('manifest fails closed when revocations cannot be read; revoke is idempotent and a failed commit changes nothing', async () => {
  const l = new Ledger(world()); await toPublished(l);
  l.failRevList = true; await assert.rejects(curriculumManifest(l)); const pk = await listOwnerPacks(OWNER, l); assert.equal(pk.ok, false);
  l.failRevList = false; l.failCommit = true; const f = await act(l, 'revoke', REVOKE); assert.equal(f.ok, false); assert.equal(l.revocations.size, 0); assert.equal(l.current.size, 1); assert.equal(rel(l).state, 'published');
  l.failCommit = false; assert.ok((await act(l, 'revoke', REVOKE)).ok); assert.ok((await act(l, 'revoke', { ...REVOKE, reason: 'second time' })).ok);
  assert.equal(l.revocations.size, 1, 'one record per digest'); assert.equal(l.revocations.get(D(l))!.reason, 'wrong content found', 'the first reason is kept');
});

test('the manifest reports at most the 200 newest revoked digests', async () => {
  const l = new Ledger(world());
  for (let i = 0; i < 230; i++) { const d = i.toString(16).padStart(64, '0'); l.revocations.set(d, { digest: d, frameworkId: 'x', at: '2026-01-01T00:' + String(Math.floor(i / 60)).padStart(2, '0') + ':' + String(i % 60).padStart(2, '0'), by: 'o', reason: 'r' }); }
  const m = await curriculumManifest(l); assert.equal(m.revoked.length, 200); assert.equal(m.revoked[0], (229).toString(16).padStart(64, '0')); assert.ok(!m.revoked.includes('0'.padStart(64, '0')));
});

// ------------------------------------------------------------------------------------------------ client enforcement
const PROFILE_ID = 'intl-core';
const profile = (frameworkId = PROFILE_ID): AdultProfile => ({ schema: 1, status: 'completed', updatedAt: 'x', setting: 'home', countryCode: 'INTL', frameworkId, stage: 'A4', languages: ['en'], modules: [] });
const T0 = Date.parse('2026-11-22T10:00:00Z');
const api = (data: unknown) => ({ get: async () => ({ data }) });
const entry = (id: string) => ({ frameworkId: id, version: '1', digest: contentDigest(id)!, publishedAt: '2026-11-22T00:00:00Z' });

test('client: parseRevoked tolerates an older server, rejects malformed lists', () => {
  assert.deepEqual(parseRevoked({ published: [] }), []);
  assert.deepEqual(parseRevoked({ revoked: ['a'.repeat(64)] }), ['a'.repeat(64)]);
  for (const bad of [{ revoked: 'x' }, { revoked: [5] }, { revoked: ['short'] }, { revoked: Array(501).fill('a'.repeat(64)) }, null, 5]) assert.equal(parseRevoked(bad), null);
});

test('client: a sync that reports a revoked digest removes it from the cache and keeps it blocked afterwards', async () => {
  const s = new MemStore(); const ids = ['intl-core'];
  assert.equal(await syncPublished(api({ published: ids.map(entry), revoked: [] }), s, () => T0), 'updated'); assert.ok(publishedFrameworkIds(s, () => T0).has('intl-core'));
  const d = contentDigest('intl-core')!;
  assert.equal(await syncPublished(api({ published: ids.map(entry), revoked: [d] }), s, () => T0 + 1000), 'updated'); // even a manifest that wrongly still lists it
  assert.equal(publishedFrameworkIds(s, () => T0 + 1000).size, 0); assert.ok(readRevoked(s).has(d));
  assert.equal(profilePublished(profile(), s, () => T0 + 1000), false);
  // a LATER manifest that no longer mentions it (server list capped) still cannot bring it back on this device
  assert.equal(await syncPublished(api({ published: ids.map(entry), revoked: [] }), s, () => T0 + 2000), 'updated');
  assert.equal(publishedFrameworkIds(s, () => T0 + 2000).size, 0, 'revocations are never un-learned');
});

test('client: an OLD cache entry is blocked as soon as the revoked list is known, even without a fresh manifest', async () => {
  const s = new MemStore(); await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0);
  assert.ok(publishedFrameworkIds(s, () => T0 + 5000).has('intl-core'));
  s.data.set(REVOKED_KEY, JSON.stringify([contentDigest('intl-core')])); // learned by another sync/tab
  assert.equal(publishedFrameworkIds(s, () => T0 + 5000).size, 0);
});

test('client: an unreadable revoked list clears the cache (fail closed); network errors keep it but the age limit applies', async () => {
  const s = new MemStore(); await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0);
  assert.equal(await syncPublished(api({ published: [entry('intl-core')], revoked: [5] }), s, () => T0 + 1), 'cleared'); assert.equal(s.data.has(PUBLISHED_CACHE_KEY), false);
  await syncPublished(api({ published: [entry('intl-core')] }), s, () => T0);
  assert.equal(await syncPublished({ get: async () => { throw new Error('offline'); } }, s, () => T0 + 10), 'kept'); assert.ok(publishedFrameworkIds(s, () => T0 + 10).has('intl-core'));
});

test('OFFLINE RISK: a device that cannot reach the server keeps personalised screens for at most 24 hours after its last sync, then fails closed', async () => {
  const H = 3600 * 1000; const s = new MemStore(); await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0);
  // the owner revokes now; this device never hears about it (offline revocation cannot be immediate)
  const at = (ms: number) => publishedFrameworkIds(s, () => T0 + ms).size;
  assert.equal(PUBLISHED_MAX_AGE_MS, 24 * H);
  assert.equal(at(0), 1); assert.equal(at(24 * H - 1), 1, 'still shown just before 24 hours (documented exposure)');
  assert.equal(at(24 * H), 1, 'the boundary itself is still allowed');
  assert.equal(at(24 * H + 1), 0, 'after 24 hours the original screens return');
  assert.equal(at(48 * H), 0); assert.equal(at(72 * H), 0, 'the old 3-day window is gone');
});

test('CLOCK CHANGES: a clock moved forward expires the cache early; one moved back cannot extend it; tolerance is 5 minutes', async () => {
  const H = 3600 * 1000, M = 60 * 1000; const s = new MemStore(); await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0);
  const at = (ms: number) => publishedFrameworkIds(s, () => T0 + ms).size;
  assert.equal(at(30 * 24 * H), 0, 'clock jumped a month forward: fail closed');
  assert.equal(at(-5 * M), 1, 'inside the skew tolerance'); assert.equal(at(-5 * M - 1), 0, 'just beyond it: fail closed');
  assert.equal(at(-H), 0, 'clock set back an hour: fail closed (cannot buy extra time)');
  assert.equal(at(-30 * 24 * H), 0, 'clock set back a month: fail closed');
  // setting the clock back before the last sync and waiting 24h of "device time" does not help either
  assert.equal(at(-H + 24 * H), 1, 'clock honest again, within 24 h of the sync: allowed');
  // a sync made while the clock was wrong (future) stamps a future time; when the clock is corrected the cache fails closed until the next sync
  const s2 = new MemStore(); await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s2, () => T0 + 10 * 24 * H);
  assert.equal(publishedFrameworkIds(s2, () => T0).size, 0);
  assert.equal(await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s2, () => T0), 'updated'); assert.equal(publishedFrameworkIds(s2, () => T0 + 1).size, 1, 'the next good sync repairs it');
});

test('RECONNECTION: syncing after expiry restores service; syncing after a revoke blocks it for good; a failed sync never refreshes the clock', async () => {
  const H = 3600 * 1000; const s = new MemStore(); await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0);
  const at = (ms: number) => publishedFrameworkIds(s, () => T0 + ms).size;
  assert.equal(await syncPublished({ get: async () => { throw new Error('offline'); } }, s, () => T0 + 20 * H), 'kept');
  assert.equal(at(25 * H), 0, 'a failed sync did not extend the 24-hour window');
  assert.equal(await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0 + 26 * H), 'updated');
  assert.equal(at(27 * H), 1, 'reconnected and still published: service resumes');
  await syncPublished(api({ published: [], revoked: [contentDigest('intl-core')] }), s, () => T0 + 28 * H);
  assert.equal(at(28 * H + 1), 0, 'reconnected after a revoke: blocked at once');
  await syncPublished(api({ published: [entry('intl-core')], revoked: [] }), s, () => T0 + 29 * H);
  assert.equal(at(29 * H + 1), 0, 'a later manifest that lists the digest again cannot un-revoke it');
});

test('re-sync: runs at start, on visible, on focus/online, on the timer; rate-limited; stop() removes every listener', async () => {
  let t = T0; let calls = 0; const handlers = new Map<string, () => void>(); let timer: (() => void) | null = null; let cleared = 0;
  const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: (e: string, f: () => void) => { handlers.set('d:' + e, f); }, removeEventListener: (e: string) => { handlers.delete('d:' + e); } };
  const win = { addEventListener: (e: string, f: () => void) => { handlers.set('w:' + e, f); }, removeEventListener: (e: string) => { handlers.delete('w:' + e); } };
  const s = new MemStore(); const a = { get: async () => { calls++; return { data: { published: [], revoked: [] } }; } };
  const stop = startPublishedResync(a, s, { now: () => t, doc: doc as never, win: win as never, setTimer: (fn) => { timer = fn; return 1; }, clearTimer: () => { cleared++; }, minGapMs: 60_000, intervalMs: 1_800_000 });
  await new Promise((r) => setImmediate(r)); assert.equal(calls, 1, 'on start');
  handlers.get('d:visibilitychange')!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 1, 'rate-limited within 60 s');
  t += 61_000; handlers.get('d:visibilitychange')!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 2, 'tab became visible');
  doc.visibilityState = 'hidden' as DocumentVisibilityState; t += 61_000; handlers.get('d:visibilitychange')!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 2, 'hidden tab does not sync');
  t += 61_000; handlers.get('w:online')!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 3, 'network came back');
  t += 61_000; handlers.get('w:focus')!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 4, 'window focus');
  t += 1_800_000; timer!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 5, '30-minute timer');
  stop(); assert.equal(handlers.size, 0); assert.equal(cleared, 1); t += 9e6; timer!(); await new Promise((r) => setImmediate(r)); assert.equal(calls, 5, 'stopped');
  assert.doesNotThrow(() => startPublishedResync(a, null, { doc: undefined as never, win: undefined as never, setTimer: () => 0, clearTimer: () => undefined })());
});

test('re-sync: calling start again (showApp can run more than once) replaces the previous run: one set of listeners, one timer', async () => {
  const handlers = new Map<string, () => void>(); let cleared = 0; let timers = 0;
  const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: (e: string, f: () => void) => { handlers.set('d:' + e, f); }, removeEventListener: (e: string) => { handlers.delete('d:' + e); } };
  const win = { addEventListener: (e: string, f: () => void) => { handlers.set('w:' + e, f); }, removeEventListener: (e: string) => { handlers.delete('w:' + e); } };
  const a = { get: async () => ({ data: { published: [], revoked: [] } }) }; const o = { doc: doc as never, win: win as never, setTimer: () => ++timers, clearTimer: () => { cleared++; } };
  const stop1 = startPublishedResync(a, new MemStore(), o); const stop2 = startPublishedResync(a, new MemStore(), o);
  assert.equal(timers, 2); assert.equal(cleared, 1, 'the first timer was cleared when the second run started'); assert.equal(handlers.size, 3);
  stop1(); assert.equal(handlers.size, 0, 'stopping the stale handle also removed the shared listener names (same keys); a second stop is harmless'); stop2(); assert.equal(handlers.size, 0);
});
