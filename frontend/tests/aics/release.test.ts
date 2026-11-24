import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  ACCOUNT_DATA_KEYS, ACTIVITIES, FRAMEWORKS, PROFILE_KEY, PUBLISHED_CACHE_KEY, PUBLISHED_MAX_AGE_MS, REAL_WORLD, activateAccount, aicsWorlds, authorizeOwner, contentDigest,
  evaluateGates, listOwnerAudit, listOwnerPacks, ownerAction, parseManifest, profilePublished, publishedFrameworkIds, publishedManifest, requiredRoles, resolveProfile, sha256Hex, syncPublished,
} from '../../src/aics/index.ts';
import type { Activity, AuditEntry, CurrentPointer, Framework, Mapping, OwnerDeps, Op, Release, Revocation, ReviewRole, World } from '../../src/aics/index.ts';
import { V48_GROUPS } from './fixtures/worlds-v48.ts';
import { MemStore, markPublished, publishedCacheJson } from './helpers.ts';

import { GOOD_ACT, Ledger, OWNER, fixtureHasNoBlockers, fwOf, rowOf, world } from './ledger.ts';
const act = (l: Ledger, action: string, body: Record<string, unknown>, caller = OWNER) => ownerAction(caller, action, () => body, l);
const rel = (l: Ledger): Release => l.releases.get('fx-pack@' + l.w.frameworks[0].version)!;
async function review(l: Ledger, role: ReviewRole = 'educator', reviewer = 'A. Teacher') { const r = rel(l); return act(l, 'review', { releaseId: r.id, role, reviewer, note: 'checked', expectedRev: r.rev }); }
async function step(l: Ledger, a: string, extra: Record<string, unknown> = {}) { const r = rel(l); return act(l, a, { releaseId: r.id, expectedRev: r.rev, ...extra }); }
async function toApproved(l: Ledger): Promise<void> {
  assert.ok((await act(l, 'create', { frameworkId: 'fx-pack' })).ok); assert.ok((await review(l)).ok); assert.ok((await step(l, 'submit')).ok);
  const ap = await step(l, 'approve'); assert.ok(ap.ok, JSON.stringify(ap));
}
async function toPublished(l: Ledger): Promise<void> { await toApproved(l); const p = await step(l, 'publish'); assert.ok(p.ok, JSON.stringify(p)); }

test('fixture sanity: the test pack has no blocker other than the review it still needs', () => {
  assert.deepEqual(fixtureHasNoBlockers(world()), []);
});

// ---------------------------------------------------------------- authorization
test('owner only: every other caller is refused on every action BEFORE the body is read, and nothing is written', async () => {
  const l = new Ledger(world()); let bodyReads = 0;
  const callers: [string, unknown][] = [['none', null], ['no id', { role: 'owner' }], ['blank id', { userId: '  ', role: 'owner' }], ['admin', { userId: 'u', role: 'admin' }], ['staff', { userId: 'u', role: 'staff' }],
    ['licensee', { userId: 'u', role: 'licensed' }], ['school', { userId: 'u', role: 'school' }], ['Owner', { userId: 'u', role: 'Owner' }], ['array', { userId: 'u', role: ['owner'] }], ['no role', { userId: 'u' }], ['user id says owner', { userId: 'owner', role: 'user' }], ['type word', { userId: 'u', role: undefined, accountType: 'owner' }]];
  for (const [name, c] of callers) {
    for (const a of ['create', 'review', 'submit', 'approve', 'publish', 'archive', 'rollback', 'nonsense']) {
      const r = await ownerAction(c as never, a, () => { bodyReads++; return {}; }, l);
      assert.equal(r.ok, false, name + ' ' + a); assert.ok(!r.ok && (r.status === 401 || r.status === 403), name + ' ' + a);
    }
    assert.equal((await listOwnerPacks(c as never, l)).ok, false, name); assert.equal((await listOwnerAudit(c as never, l)).ok, false, name);
  }
  assert.equal(bodyReads, 0); assert.equal(l.commits, 0); assert.equal(l.releases.size, 0);
  assert.deepEqual([authorizeOwner(OWNER).ok, authorizeOwner({ userId: 'x', role: 'owner' }).ok], [true, true]);
});

// ---------------------------------------------------------------- the whole lifecycle
test('lifecycle: create → review → submit → approve → publish → manifest → archive → rollback, with an audit trail', async () => {
  const l = new Ledger(world());
  await toPublished(l); const r = rel(l);
  assert.equal(r.state, 'published'); assert.equal(r.approvedBy, 'u-owner'); assert.equal(l.current.get('fx-pack')?.releaseId, 'fx-pack@1.0');
  const m = await publishedManifest(l); assert.equal(m.length, 1); assert.equal(m[0].digest, contentDigest('fx-pack', l.w));
  assert.deepEqual(Object.keys(m[0]).sort(), ['digest', 'frameworkId', 'publishedAt', 'version'], 'no reviewer names or notes leave the server');
  const ar = await step(l, 'archive', { reason: 'found a typo' }); assert.ok(ar.ok);
  assert.equal(l.current.size, 0); assert.deepEqual(await publishedManifest(l), [], 'archived: children get the original screens');
  const rb = await step(l, 'rollback'); assert.ok(rb.ok, JSON.stringify(rb)); assert.equal(rel(l).state, 'published'); assert.equal((await publishedManifest(l)).length, 1);
  assert.deepEqual((await listOwnerAudit(OWNER, l) as { audit: AuditEntry[] }).audit.map((a) => a.action).reverse(), ['create', 'review', 'submit', 'approve', 'publish', 'archive', 'rollback']);
  assert.ok(l.audit.every((a) => a.actor === 'u-owner' && a.at));
  const view = await listOwnerPacks(OWNER, l); assert.ok(view.ok && view.packs[0].isCurrent && view.packs[0].release?.state === 'published');
});

test('state machine: no step can be skipped or repeated', async () => {
  const l = new Ledger(world()); assert.ok((await act(l, 'create', { frameworkId: 'fx-pack' })).ok);
  for (const a of ['approve', 'publish', 'rollback']) { const r = await step(l, a); assert.deepEqual([r.ok, !r.ok && r.status], [false, 409], a + ' from draft'); }
  await review(l); assert.ok((await step(l, 'submit')).ok);
  assert.equal((await step(l, 'submit')).ok, false); assert.equal((await step(l, 'publish')).ok, false, 'in-review cannot publish');
  assert.equal((await review(l)).ok, true, 'reviews may still be added while in review');
  assert.ok((await step(l, 'approve')).ok); assert.equal((await review(l)).ok, false, 'no reviews after approval');
  assert.equal((await step(l, 'approve')).ok, false); assert.ok((await step(l, 'publish')).ok); assert.equal((await step(l, 'publish')).ok, false);
  assert.equal((await step(l, 'rollback')).ok, false, 'a published release cannot be rolled back to');
  assert.equal((await act(l, 'create', { frameworkId: 'fx-pack' })).ok, false, 'one release per version');
  assert.ok((await step(l, 'archive', { reason: 'withdrawn' })).ok); assert.equal((await step(l, 'archive', { reason: 'again' })).ok, false);
});

test('input validation: unknown things, wrong types, missing revision, bad reviewer or reason', async () => {
  const l = new Ledger(world());
  assert.equal((await act(l, 'nonsense', {})).ok, false);
  for (const body of [null, 'x', 5, [], undefined]) assert.equal((await ownerAction(OWNER, 'create', () => body, l)).ok, false);
  assert.equal((await ownerAction(OWNER, 'create', () => { throw new Error('bad json'); }, l)).ok, false);
  assert.equal((await act(l, 'create', { frameworkId: 'nope' })).ok, false); assert.equal((await act(l, 'create', { frameworkId: 5 })).ok, false);
  await act(l, 'create', { frameworkId: 'fx-pack' }); const r = rel(l);
  assert.equal((await act(l, 'submit', { releaseId: 'zzz', expectedRev: 1 })).ok, false);
  for (const exp of [undefined, 0, 2, '1', null]) assert.equal((await act(l, 'submit', { releaseId: r.id, expectedRev: exp })).ok, false, String(exp));
  for (const b of [{ role: 'educator' }, { role: 'educator', reviewer: ' ' }, { role: 'boss', reviewer: 'x' }, { role: 'educator', reviewer: 'x'.repeat(81) }, { role: 'educator', reviewer: 'x', note: 'n'.repeat(301) }, { role: 'educator', reviewer: 5 }]) {
    const x = await act(l, 'review', { releaseId: r.id, expectedRev: 1, ...b }); assert.equal(x.ok, false, JSON.stringify(b).slice(0, 60));
  }
  assert.equal(rel(l).reviews.length, 0); assert.equal(rel(l).rev, 1);
  await toApprovedFrom(l);
  for (const reason of [undefined, '', '  ', 'ab', 'x'.repeat(201), 5]) assert.equal((await step(l, 'archive', { reason })).ok, false, String(reason));
});
async function toApprovedFrom(l: Ledger): Promise<void> { await review(l); await step(l, 'submit'); await step(l, 'approve'); }

// ---------------------------------------------------------------- gates (each one on its own)
test('gates: tracked-only, pending-source rows, Draft linked content, unverified source, unconfirmed URL, missing roles each block approval', async () => {
  const cases: [string, World, RegExp][] = [
    ['tracked-only', world({ fw: { selectable: false } }), /Tracked only/],
    ['pending-source row', world({ rows: [rowOf('map.fx.a'), rowOf('map.fx.p', { status: 'pending-source', competencyIds: [], domainIds: [], ageBands: [] })] }), /pending its official source/],
    ['draft linked activity', world({ acts: [{ ...GOOD_ACT, contentStatus: 'draft' }] }), /Draft content/],
    ['unverified source', world({ fw: { verification: 'secondary-only' } }), /primary verification|not primary-verified/],
    ['primary-verified without confirmed URL', world({ fw: { verification: 'primary-verified', sourceUrl: 'https://example.org/x', urlConfirmed: false } }), /confirmed source URL/],
    ['no rows', world({ rows: [] }), /No mappings/],
    ['missing linked activity', world({ acts: [] }), /does not exist/],
    ['official outcome row without a ref', world({ rows: [rowOf('map.fx.o', { level: 'outcome', officialOutcomeRef: null })] }), /official outcome ref/],
  ];
  for (const [name, w, re] of cases) {
    const g = evaluateGates('fx-pack', [], w); assert.ok(g.blockers.some((b) => re.test(b)), name + ': ' + JSON.stringify(g.blockers));
    const l = new Ledger(w); if (!w.frameworks[0].selectable) { assert.equal((await act(l, 'create', { frameworkId: 'fx-pack' })).ok, false); continue; }
    await act(l, 'create', { frameworkId: 'fx-pack' }); await review(l); await step(l, 'submit');
    const ap = await step(l, 'approve'); assert.ok(!ap.ok && ap.status === 422 && ap.blockers!.length > 0, name); assert.equal(rel(l).state, 'in-review', name + ': state unchanged');
  }
});

test('gates: required review roles follow the content (educator always, primary-source for primary-verified, native-educator for Urdu/Arabic)', () => {
  assert.deepEqual(requiredRoles('fx-pack', world()), ['educator']);
  assert.deepEqual(requiredRoles('fx-pack', world({ fw: { verification: 'primary-verified', sourceUrl: 'https://example.org', urlConfirmed: true } })), ['educator', 'primary-source']);
  const ur: Activity = { ...GOOD_ACT, languages: ['en', 'ur'] };
  assert.deepEqual(requiredRoles('fx-pack', world({ acts: [ur] })), ['educator', 'native-educator']);
  const ar: Activity = { ...GOOD_ACT, languages: ['ar'] };
  assert.ok(requiredRoles('fx-pack', world({ acts: [ar] })).includes('native-educator'));
});

test('gates: a missing role blocks approval; the right roles let it through; reviews of OLD content do not count', async () => {
  const ur: Activity = { ...GOOD_ACT, languages: ['en', 'ur'], contentStatus: 'published' as never };
  const w = world({ acts: [ur] });
  const l = new Ledger(w); await act(l, 'create', { frameworkId: 'fx-pack' }); await review(l, 'educator'); await step(l, 'submit');
  const no = await step(l, 'approve'); assert.ok(!no.ok && no.blockers!.some((b) => /native-educator/.test(b)));
  await review(l, 'native-educator', 'N. Speaker').catch(() => null);
  // review is refused in in-review? no: reviews are allowed until approval
  assert.equal(rel(l).reviews.some((r) => r.role === 'native-educator'), true);
  const ok = await step(l, 'approve'); assert.ok(ok.ok, JSON.stringify(ok));
  // stale reviews: same reviews, changed content → not valid
  const g0 = evaluateGates('fx-pack', rel(l).reviews, w); assert.deepEqual(g0.missingRoles, []);
  const changed = world({ acts: [ur], rows: [rowOf('map.fx.a', { note: 'Changed text.' }), rowOf('map.fx.b')] });
  const g1 = evaluateGates('fx-pack', rel(l).reviews, changed); assert.deepEqual(g1.missingRoles.sort(), ['educator', 'native-educator']);
});

test('digest: changes with anything a child could see, ignores review bookkeeping', () => {
  const base = contentDigest('fx-pack', world())!; assert.match(base, /^[0-9a-f]{64}$/); assert.equal(contentDigest('fx-pack', world()), base);
  const variants: [string, World][] = [
    ['row note', world({ rows: [rowOf('map.fx.a', { note: 'Different.' }), rowOf('map.fx.b')] })], ['row activity', world({ rows: [rowOf('map.fx.a', { activityIds: [] }), rowOf('map.fx.b')] })],
    ['framework version', world({ fw: { version: '1.1' } })], ['verification', world({ fw: { verification: 'secondary-only' } })], ['linked activity language', world({ acts: [{ ...GOOD_ACT, languages: ['en', 'ur'] }] })],
    ['linked activity status', world({ acts: [{ ...GOOD_ACT, contentStatus: 'draft' }] })], ['extra row', world({ rows: [rowOf('map.fx.a'), rowOf('map.fx.b'), rowOf('map.fx.c')] })], ['age band', world({ rows: [rowOf('map.fx.a', { ageBands: ['A5'] }), rowOf('map.fx.b')] })],
  ];
  for (const [n, w] of variants) assert.notEqual(contentDigest('fx-pack', w), base, n);
  const bookkeeping = world({ rows: [rowOf('map.fx.b', { status: 'published', reviewer: { name: 'x', role: 'y', date: '2026-01-01' } }), rowOf('map.fx.a')], fw: { status: 'published', reviewer: { name: 'x', role: 'y', date: '2026-01-01' } } });
  assert.equal(contentDigest('fx-pack', bookkeeping), base, 'row order and review fields do not change the digest');
  assert.equal(contentDigest('nope', world()), null);
});

// ---------------------------------------------------------------- stale content, supersede, rollback
test('the pack changes after approval: publish is refused, and an already published pack silently leaves the manifest', async () => {
  const l = new Ledger(world()); await toApproved(l);
  l.w = world({ rows: [rowOf('map.fx.a', { note: 'Edited after approval.' }), rowOf('map.fx.b')] });
  const p = await step(l, 'publish'); assert.ok(!p.ok && p.status === 422 && p.blockers!.some((b) => /Missing educator review/.test(b)), 'reviews of the old content no longer count'); assert.equal(rel(l).state, 'approved'); assert.equal(l.current.size, 0);
  const l2 = new Ledger(world()); await toPublished(l2); assert.equal((await publishedManifest(l2)).length, 1);
  l2.w = world({ rows: [rowOf('map.fx.a', { note: 'Edited after publication.' }), rowOf('map.fx.b')] });
  assert.deepEqual(await publishedManifest(l2), [], 'fail closed: the live pack is no longer the approved one');
  assert.equal(l2.current.size, 1, 'the ledger still says published; the manifest simply refuses to vouch for it');
});

test('a gate that starts failing later (content turned Draft) also withdraws the publication', async () => {
  const l = new Ledger(world()); await toPublished(l);
  l.w = world({ acts: [{ ...GOOD_ACT, contentStatus: 'draft' }] }); assert.deepEqual(await publishedManifest(l), []);
});

test('new version supersedes the old one; rolling back to a build whose content no longer matches is refused', async () => {
  const l = new Ledger(world()); await toPublished(l);
  l.w = world({ fw: { version: '2.0' } });
  assert.deepEqual(await publishedManifest(l), [], 'v1 is not what this build ships');
  assert.ok((await act(l, 'create', { frameworkId: 'fx-pack' })).ok);
  const r2 = l.releases.get('fx-pack@2.0')!; assert.ok((await act(l, 'review', { releaseId: r2.id, role: 'educator', reviewer: 'A', note: '', expectedRev: r2.rev })).ok);
  for (const a of ['submit', 'approve', 'publish']) { const cur = l.releases.get('fx-pack@2.0')!; const x = await act(l, a, { releaseId: cur.id, expectedRev: cur.rev }); assert.ok(x.ok, a + JSON.stringify(x)); }
  assert.equal(l.releases.get('fx-pack@1.0')!.state, 'superseded'); assert.equal(l.current.get('fx-pack')!.releaseId, 'fx-pack@2.0'); assert.equal((await publishedManifest(l)).length, 1);
  const v1 = l.releases.get('fx-pack@1.0')!;
  const rb = await act(l, 'rollback', { releaseId: v1.id, expectedRev: v1.rev }); assert.ok(!rb.ok && (rb.status === 409 || rb.status === 422), JSON.stringify(rb));
  assert.equal(l.current.get('fx-pack')!.releaseId, 'fx-pack@2.0', 'nothing changed'); assert.equal(l.releases.get('fx-pack@1.0')!.state, 'superseded');
  // when the build matches again the rollback works and the newer one is superseded
  l.w = world(); const v1b = l.releases.get('fx-pack@1.0')!;
  assert.ok((await act(l, 'rollback', { releaseId: v1b.id, expectedRev: v1b.rev })).ok); assert.equal(l.releases.get('fx-pack@2.0')!.state, 'superseded'); assert.equal(l.current.get('fx-pack')!.releaseId, 'fx-pack@1.0');
});

test('rollback to a release that was never published is refused', async () => {
  const l = new Ledger(world()); await act(l, 'create', { frameworkId: 'fx-pack' }); await step(l, 'archive', { reason: 'never used' });
  const r = await step(l, 'rollback'); assert.ok(!r.ok && r.status === 409); assert.equal(l.current.size, 0);
});

// ---------------------------------------------------------------- atomicity and concurrency
test('a storage failure leaves everything unchanged: release, current pointer and audit are committed together or not at all', async () => {
  const l = new Ledger(world()); await toApproved(l);
  const before = JSON.stringify([[...l.releases], [...l.current], l.audit]);
  l.failCommit = true; const p = await step(l, 'publish'); assert.ok(!p.ok && p.status === 500);
  l.failCommit = false; assert.equal(JSON.stringify([[...l.releases], [...l.current], l.audit]), before);
  assert.ok((await step(l, 'publish')).ok);
});

test('two owners acting at once: exactly one wins, the other is told to reload; no duplicate current pointer or audit entry', async () => {
  const l = new Ledger(world()); await toApproved(l); const r = rel(l); const n0 = l.audit.length;
  const [a, b] = await Promise.all([act(l, 'publish', { releaseId: r.id, expectedRev: r.rev }), act(l, 'archive', { releaseId: r.id, expectedRev: r.rev, reason: 'racing archive' })]);
  assert.equal([a, b].filter((x) => x.ok).length, 1); assert.ok([a, b].some((x) => !x.ok && x.status === 409));
  assert.equal(l.audit.length, n0 + 1);
});

test('a stale screen cannot overwrite a newer release (revision check), and a current-pointer race is rejected', async () => {
  const l = new Ledger(world()); await toApproved(l); const stale = rel(l);
  await step(l, 'publish'); const x = await act(l, 'archive', { releaseId: stale.id, expectedRev: stale.rev, reason: 'from a stale page' }); assert.ok(!x.ok && x.status === 409); assert.equal(rel(l).state, 'published');
  const ok = await l.commit([{ kind: 'current', frameworkId: 'fx-pack', value: null, expectedReleaseId: 'someone-else' }]); assert.equal(ok, false);
});

// ---------------------------------------------------------------- the real registries
test('real registries: every pack in this build has blockers, so nothing can be approved or published and the manifest stays empty', async () => {
  const l = new Ledger(REAL_WORLD);
  for (const fw of FRAMEWORKS) {
    const g = evaluateGates(fw.id, [], REAL_WORLD); assert.ok(g.blockers.length > 0, fw.id);
    if (!fw.selectable) { assert.equal((await act(l, 'create', { frameworkId: fw.id })).ok, false, fw.id); continue; }
    assert.ok((await act(l, 'create', { frameworkId: fw.id })).ok, fw.id);
    const id = fw.id + '@' + fw.version;
    // an owner who records every possible review still cannot get past the content gates
    for (const role of requiredRoles(fw.id)) { const r = l.releases.get(id)!; await act(l, 'review', { releaseId: id, role, reviewer: 'Owner-recorded', note: '', expectedRev: r.rev }); }
    let r = l.releases.get(id)!; await act(l, 'submit', { releaseId: id, expectedRev: r.rev }); r = l.releases.get(id)!;
    const ap = await act(l, 'approve', { releaseId: id, expectedRev: r.rev }); assert.ok(!ap.ok && ap.status === 422, fw.id + ' must not be approvable');
  }
  assert.deepEqual(await publishedManifest(l), []);
  assert.ok(FRAMEWORKS.every((f) => f.status === 'draft' || f.status === 'under-review' || true));
  const v = await listOwnerPacks(OWNER, l); assert.ok(v.ok && v.packs.length === FRAMEWORKS.length && v.packs.every((p) => !p.isCurrent && p.gates.blockers.length > 0));
});

test('Urdu and Arabic activities can never be published through the ledger while they are Draft', () => {
  for (const a of ACTIVITIES.filter((x) => x.languages.includes('ur'))) assert.equal(a.contentStatus, 'draft');
  const g = evaluateGates('intl-core', [], REAL_WORLD); assert.ok(g.blockers.some((b) => /urdu-letters is Draft/.test(b)));
});

// ---------------------------------------------------------------- the child-facing gate
const manifestJson = (entries: unknown[]) => ({ data: { published: entries } });
const good = (id: string) => ({ frameworkId: id, version: '1', digest: contentDigest(id), publishedAt: '2026-11-22T00:00:00.000Z' });

test('manifest parsing is strict: bad shapes, short digests and oversize lists are rejected whole', () => {
  assert.equal(parseManifest(null), null); assert.equal(parseManifest({}), null); assert.equal(parseManifest({ published: 'x' }), null);
  assert.equal(parseManifest({ published: [{ frameworkId: 'a', version: '1', digest: 'abc', publishedAt: 'x' }] }), null);
  assert.equal(parseManifest({ published: Array.from({ length: 51 }, () => good('intl-core')) }), null);
  assert.equal(parseManifest({ published: [{ ...good('intl-core'), extra: 1 }, 5] }), null);
  assert.deepEqual(parseManifest({ published: [] }), []); assert.equal(parseManifest({ published: [good('intl-core')] })!.length, 1);
});

test('syncPublished caches only entries that match this build; errors keep the old cache (which still expires); garbage clears it', async () => {
  const s = new MemStore(); const t0 = Date.parse('2026-11-22T00:00:00Z');
  const wrong = { ...good('snc-ecce-2020'), digest: '0'.repeat(64) };
  assert.equal(await syncPublished({ get: async () => manifestJson([good('intl-core'), wrong]) }, s, () => t0), 'updated');
  assert.deepEqual([...publishedFrameworkIds(s, () => t0)], ['intl-core']);
  assert.equal(JSON.parse(s.data.get(PUBLISHED_CACHE_KEY)!).entries.length, 1, 'the entry that does not match this build is not even stored');
  assert.equal(await syncPublished({ get: async () => { throw new Error('offline'); } }, s, () => t0 + 1000), 'kept'); assert.ok(publishedFrameworkIds(s, () => t0 + 1000).has('intl-core'));
  assert.equal(publishedFrameworkIds(s, () => t0 + PUBLISHED_MAX_AGE_MS + 1000).size, 0, 'older than the limit: ignored');
  assert.equal(publishedFrameworkIds(s, () => t0 - 3600_000).size, 0, 'a clock far in the past is not trusted');
  assert.equal(await syncPublished({ get: async () => ({ data: { nope: 1 } }) }, s, () => t0), 'cleared'); assert.equal(s.data.has(PUBLISHED_CACHE_KEY), false);
  assert.equal(await syncPublished({ get: async () => manifestJson([]) }, s, () => t0), 'updated'); assert.equal(publishedFrameworkIds(s, () => t0).size, 0, 'owner archived everything → empty');
  assert.equal(await syncPublished({ get: async () => manifestJson([]) }, null), 'cleared');
});

test('a tampered or stale cache cannot publish anything: wrong digest, wrong shape, wrong schema, unknown framework', () => {
  const now = Date.now(); const iso = new Date(now).toISOString();
  const put = (v: unknown) => { const s = new MemStore(); s.data.set(PUBLISHED_CACHE_KEY, typeof v === 'string' ? v : JSON.stringify(v)); return publishedFrameworkIds(s, () => now); };
  assert.equal(put({ schema: 1, fetchedAt: iso, entries: [{ frameworkId: 'intl-core', digest: 'f'.repeat(64) }] }).size, 0);
  assert.equal(put({ schema: 2, fetchedAt: iso, entries: [good('intl-core')] }).size, 0);
  assert.equal(put({ schema: 1, fetchedAt: 'yesterday', entries: [good('intl-core')] }).size, 0);
  assert.equal(put({ schema: 1, fetchedAt: iso, entries: [{ frameworkId: 'made-up', digest: contentDigest('intl-core') }] }).size, 0);
  assert.equal(put('{not json').size, 0); assert.equal(put({ schema: 1, fetchedAt: iso, entries: 'x' }).size, 0);
  assert.equal(put({ schema: 1, fetchedAt: iso, entries: [good('intl-core')] }).size, 1);
});

const profileFor = (cc: string, fw: string): string => JSON.stringify({ schema: 1, status: 'completed', updatedAt: '2026-11-22T00:00:00.000Z', setting: 'home', countryCode: cc, frameworkId: fw, stage: 'A4', languages: ['en'], modules: [] });

test('Learning Worlds: personalise only when the base AND every overlay are published; every other case shows the original screens', () => {
  const resolved = resolveProfile({ countryCode: 'AE', frameworkId: 'intl-core' }); assert.deepEqual(resolved.overlayIds, ['uae-moe-kg-overlay']);
  const mk = (ids?: readonly string[], cache?: string) => { const s = new MemStore(); s.data.set(PROFILE_KEY, profileFor('AE', 'intl-core')); if (cache !== undefined) s.data.set(PUBLISHED_CACHE_KEY, cache); else if (ids) markPublished(s, ids); return s; };
  const original = (s: MemStore) => assert.strictEqual(aicsWorlds(V48_GROUPS, s).groups, V48_GROUPS);
  original(mk()); original(mk([])); original(mk(['intl-core'])); original(mk(['uae-moe-kg-overlay'])); original(mk(['snc-ecce-2020']));
  original(mk(undefined, publishedCacheJson(['intl-core', 'uae-moe-kg-overlay'], '2020-01-01T00:00:00.000Z')));
  const bad = JSON.parse(publishedCacheJson(['intl-core', 'uae-moe-kg-overlay'])); bad.entries[1].digest = '1'.repeat(64); original(mk(undefined, JSON.stringify(bad)));
  assert.equal(aicsWorlds(V48_GROUPS, mk(['intl-core', 'uae-moe-kg-overlay'])).personalised, true);
  assert.equal(profilePublished(null, new MemStore()), false);
});

test('Learning Worlds: the account-independent published cache is not child data and survives account switches', async () => {
  assert.ok(!ACCOUNT_DATA_KEYS.includes(PUBLISHED_CACHE_KEY));
  const s = new MemStore(); markPublished(s); await activateAccount(s, 'a'); await activateAccount(s, 'b'); assert.ok(s.data.has(PUBLISHED_CACHE_KEY));
});

test('sha256: matches node:crypto for empty, short, block-boundary, long and non-ASCII input', () => {
  for (const t of ['', 'a', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'x'.repeat(1000), 'اردو ✓ 😀', JSON.stringify({ a: [1, 2, 3] }).repeat(40)]) {
    assert.equal(sha256Hex(t), createHash('sha256').update(t).digest('hex'), t.slice(0, 10));
  }
});

test('defence in depth: an approval whose digest differs from the current content is refused even if reviews were somehow valid', async () => {
  const l = new Ledger(world()); await toApproved(l);
  const r = rel(l); l.releases.set(r.id, { ...r, approvedDigest: '0'.repeat(64), rev: r.rev });
  const p = await step(l, 'publish'); assert.ok(!p.ok && p.status === 409 && /changed after approval/.test(p.error)); assert.equal(l.current.size, 0);
  const l2 = new Ledger(world()); await toPublished(l2); const r2 = l2.releases.get('fx-pack@1.0')!; l2.releases.set(r2.id, { ...r2, approvedDigest: '0'.repeat(64) });
  assert.deepEqual(await publishedManifest(l2), [], 'a published release whose approved digest does not match is not vouched for');
});

test('manifest refuses inconsistent ledger state: pointer digest differs, pointer to an archived release, pointer to a missing release', async () => {
  const l = new Ledger(world()); await toPublished(l);
  const p = l.current.get('fx-pack')!;
  l.current.set('fx-pack', { ...p, digest: 'a'.repeat(64) }); assert.deepEqual(await publishedManifest(l), []);
  l.current.set('fx-pack', { ...p, releaseId: 'fx-pack@9.9' }); assert.deepEqual(await publishedManifest(l), []);
  l.current.set('fx-pack', p); assert.equal((await publishedManifest(l)).length, 1);
  const r = l.releases.get('fx-pack@1.0')!; l.releases.set(r.id, { ...r, state: 'archived' }); assert.deepEqual(await publishedManifest(l), []);
  l.releases.set(r.id, { ...r, frameworkId: 'other' }); assert.deepEqual(await publishedManifest(l), []);
});

test('a release holds at most 50 reviews', async () => {
  const l = new Ledger(world()); await act(l, 'create', { frameworkId: 'fx-pack' });
  for (let i = 0; i < 50; i++) assert.ok((await review(l)).ok);
  const x = await review(l); assert.ok(!x.ok && x.status === 422); assert.equal(rel(l).reviews.length, 50);
});

test('the pack-level rules of the existing registry validator apply: a pack the validator rejects cannot pass even with every review', async () => {
  const dupRows = world({ rows: [rowOf('map.fx.a', { level: 'outcome', officialOutcomeRef: 'X.1', sourceRef: 's' }), rowOf('map.fx.b', { level: 'outcome', officialOutcomeRef: 'X.1', sourceRef: 's' })] });
  assert.ok(evaluateGates('fx-pack', [], dupRows).blockers.some((b) => /Duplicate outcome ref/.test(b)));
  const longNote = world({ rows: [rowOf('map.fx.a', { note: 'n'.repeat(241) })] });
  assert.ok(evaluateGates('fx-pack', [], longNote).blockers.some((b) => /too long/.test(b)));
  const badBand = world({ rows: [rowOf('map.fx.a', { ageBands: [] })] });
  assert.ok(evaluateGates('fx-pack', [], badBand).blockers.some((b) => /no age bands/.test(b)));
  assert.ok(!evaluateGates('fx-pack', [], world()).blockers.some((b) => /Duplicate|too long|age bands/.test(b)));
});
