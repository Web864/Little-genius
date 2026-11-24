import { evaluateGates, newRelease, releaseId, REAL_WORLD, REVIEW_ROLES, TRANSITIONS } from './packRelease.ts';
import type { CurrentPointer, GateResult, Release, Revocation, ReviewRole, World } from './packRelease.ts';

// Phase 8 owner service: review, approve, publish, archive and roll back curriculum packs.
// Dependency-injected like schoolService (no backend import); the AppDeploy SDK glue is integration/backend/curriculumRoutes.ts (written against the
// SDK reference, NOT compiled against or run on the real SDK here; real SDK integration and owner-authorization tests remain a mandatory release gate).
// Server rules: owner only (role === 'owner' exactly, never a user-chosen account type), authorization BEFORE the body is read,
// optimistic revision checks, every state change commits release + current pointer + audit entry atomically or not at all.

export interface OwnerCaller { userId?: unknown; role?: unknown }
export type Fail = { ok: false; status: 400 | 401 | 403 | 404 | 409 | 422 | 500; error: string; blockers?: string[] };
export type Ok<T> = { ok: true } & T;

export interface AuditEntry { id: string; at: string; actor: string; action: string; releaseId: string; detail: string }
export type Op =
  | { kind: 'release'; value: Release; expectedRev: number | null }
  | { kind: 'current'; frameworkId: string; value: CurrentPointer | null; expectedReleaseId: string | null }
  | { kind: 'revocation'; value: Revocation } // put-if-absent: an existing record for the same digest is left as it is (still revoked)
  | { kind: 'audit'; value: AuditEntry };

export interface OwnerDeps {
  getRelease(id: string): Promise<Release | null>;
  listReleases(): Promise<Release[]>;
  listCurrent(): Promise<CurrentPointer[]>;
  listAudit(limit: number): Promise<AuditEntry[]>;
  /** MUST be complete: a missing revocation would let a revoked pack through. Throw rather than return a partial list. */
  listRevocations(): Promise<Revocation[]>;
  /** Atomic: all ops or none. Returns false when a compare-and-set condition failed (someone else changed it first). Throws on storage errors. */
  commit(ops: Op[]): Promise<boolean>;
  newId(): string;
  now(): string;
  world?: World; // tests only
}

export const authorizeOwner = (c: OwnerCaller | null | undefined): { ok: true; userId: string } | Fail => {
  if (!c || typeof c.userId !== 'string' || !c.userId.trim()) return { ok: false, status: 401, error: 'Sign in required' };
  if (c.role !== 'owner') return { ok: false, status: 403, error: 'Owner only' };
  return { ok: true, userId: c.userId };
};

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const asObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const fail = (status: Fail['status'], error: string, blockers?: string[]): Fail => ({ ok: false, status, error, ...(blockers ? { blockers } : {}) });

export interface PackView {
  frameworkId: string; name: string; kind: string; version: string; selectable: boolean;
  gates: Pick<GateResult, 'blockers' | 'requiredRoles' | 'missingRoles' | 'digest'>;
  release: Release | null; history: Release[]; isCurrent: boolean; revoked: boolean;
}

export async function listOwnerPacks(caller: OwnerCaller, deps: OwnerDeps): Promise<Ok<{ packs: PackView[] }> | Fail> {
  const a = authorizeOwner(caller); if (!a.ok) return a;
  try {
    const w = deps.world ?? REAL_WORLD;
    const [all, current, revs] = await Promise.all([deps.listReleases(), deps.listCurrent(), deps.listRevocations()]);
    const revoked = new Set(revs.map((r) => r.digest));
    const packs: PackView[] = w.frameworks.map((fw) => {
      const history = all.filter((r) => r.frameworkId === fw.id).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
      const release = history.find((r) => r.id === releaseId(fw.id, fw.version)) ?? null;
      const g = evaluateGates(fw.id, release?.reviews ?? [], w);
      return { frameworkId: fw.id, name: fw.name, kind: fw.kind, version: fw.version, selectable: fw.selectable,
        gates: { blockers: g.blockers, requiredRoles: g.requiredRoles, missingRoles: g.missingRoles, digest: g.digest }, release, history, isCurrent: current.some((c) => c.frameworkId === fw.id && c.releaseId === release?.id), revoked: !!g.digest && revoked.has(g.digest) };
    });
    return { ok: true, packs };
  } catch { return fail(500, 'Could not read releases'); }
}

export async function listOwnerAudit(caller: OwnerCaller, deps: OwnerDeps, limit = 100): Promise<Ok<{ audit: AuditEntry[] }> | Fail> {
  const a = authorizeOwner(caller); if (!a.ok) return a;
  try { return { ok: true, audit: await deps.listAudit(Math.max(1, Math.min(500, Math.floor(limit) || 100))) }; } catch { return fail(500, 'Could not read the audit log'); }
}

/**
 * What children may be given: only entries that are published in the ledger AND pass every gate AND match the digest of this build.
 * Contains no reviewer names or notes. Any signed-in account may read it; it is not owner-gated.
 */
export async function publishedManifest(deps: OwnerDeps): Promise<{ frameworkId: string; version: string; digest: string; publishedAt: string }[]> {
  return (await curriculumManifest(deps)).published;
}

/** Newest revocations a device is told about (older ones can no longer match a pack in any build still in use). */
export const MAX_REVOKED_REPORTED = 200;

/**
 * The full child-device manifest: what may be shown AND which content digests must never be shown, even from an old cache.
 * Any storage error propagates (the route answers 500, the device keeps the revocations it already learned and its 24-hour age limit applies).
 */
export async function curriculumManifest(deps: OwnerDeps): Promise<{ published: { frameworkId: string; version: string; digest: string; publishedAt: string }[]; revoked: string[] }> {
  const w = deps.world ?? REAL_WORLD;
  const revs = await deps.listRevocations();
  const revokedSet = new Set(revs.map((r) => r.digest));
  const published: { frameworkId: string; version: string; digest: string; publishedAt: string }[] = [];
  for (const p of await deps.listCurrent()) {
    const r = await deps.getRelease(p.releaseId);
    if (!r || r.state !== 'published' || r.id !== p.releaseId || r.frameworkId !== p.frameworkId || !r.publishedAt) continue;
    const g = evaluateGates(r.frameworkId, r.reviews, w);
    if (g.blockers.length || !g.digest || g.digest !== p.digest || g.digest !== r.approvedDigest || revokedSet.has(g.digest)) continue;
    published.push({ frameworkId: p.frameworkId, version: p.version, digest: p.digest, publishedAt: p.publishedAt });
  }
  const revoked = [...revs].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX_REVOKED_REPORTED).map((r) => r.digest);
  return { published, revoked };
}

export type Action = 'create' | 'review' | 'submit' | 'approve' | 'publish' | 'archive' | 'rollback' | 'revoke';
export const ACTIONS: readonly Action[] = ['create', 'review', 'submit', 'approve', 'publish', 'archive', 'rollback', 'revoke'];

export async function ownerAction(caller: OwnerCaller, action: string, readBody: () => unknown | Promise<unknown>, deps: OwnerDeps): Promise<Ok<{ release: Release | null }> | Fail> {
  const a = authorizeOwner(caller); if (!a.ok) return a; // before the body is touched
  if (!ACTIONS.includes(action as Action)) return fail(404, 'Unknown action');
  let raw: unknown;
  try { raw = await readBody(); } catch { return fail(400, 'Bad request'); }
  const body = asObj(raw); if (!body) return fail(400, 'Bad request');
  const w = deps.world ?? REAL_WORLD;
  const at = deps.now();
  const audit = (act: string, rid: string, detail: string): Op => ({ kind: 'audit', value: { id: deps.newId(), at, actor: a.userId, action: act, releaseId: rid, detail: detail.slice(0, 300) } });
  const finish = async (ops: Op[], release: Release | null): Promise<Ok<{ release: Release | null }> | Fail> => {
    try { return (await deps.commit(ops)) ? { ok: true, release } : fail(409, 'Someone else changed this release first. Reload and try again.'); } catch (e) {
      // A storage layer that cannot tell whether the transaction committed throws an error with unknownOutcome: true. Never say "nothing was changed" then.
      if ((e as { unknownOutcome?: unknown } | null)?.unknownOutcome === true) return fail(500, 'The save may or may not have completed. Reload this screen to check before trying again.');
      return fail(500, 'Could not save. Nothing was changed.');
    }
  };
  try {
    if (action === 'create') {
      const fid = str(body.frameworkId, 80); const fw = fid ? w.frameworks.find((f) => f.id === fid) : undefined;
      if (!fid || !fw) return fail(404, 'Unknown framework');
      if (!fw.selectable) return fail(422, 'Tracked-only packs cannot be released');
      const id = releaseId(fid, fw.version);
      if (await deps.getRelease(id)) return fail(409, 'A release for this version already exists');
      const rel = newRelease(fid, fw.version, evaluateGates(fid, [], w).digest!, a.userId, at);
      return finish([{ kind: 'release', value: rel, expectedRev: null }, audit('create', id, 'created draft')], rel);
    }
    if (action === 'revoke') {
      // Emergency stop. Allowed from ANY state, no expectedRev needed (speed matters; commit is still compare-and-set so it cannot clobber a concurrent change).
      const fid = str(body.frameworkId, 80); const fw = fid ? w.frameworks.find((f) => f.id === fid) : undefined;
      const reason = str(body.reason, 200);
      if (!fid || !fw) return fail(404, 'Unknown framework');
      if (!reason || reason.length < 3) return fail(400, 'A reason is required');
      const digest = evaluateGates(fid, [], w).digest; if (!digest) return fail(404, 'Unknown framework');
      const ops: Op[] = [{ kind: 'revocation', value: { digest, frameworkId: fid, at, by: a.userId, reason } }];
      const pointers = await deps.listCurrent();
      const ptr = pointers.find((p) => p.frameworkId === fid) ?? null;
      if (ptr) {
        const live = await deps.getRelease(ptr.releaseId);
        if (live && live.state === 'published') ops.push({ kind: 'release', value: { ...live, state: 'archived', archivedBy: a.userId, archivedAt: at, archiveReason: 'REVOKED: ' + reason, rev: live.rev + 1 }, expectedRev: live.rev });
        ops.push({ kind: 'current', frameworkId: fid, value: null, expectedReleaseId: ptr.releaseId });
      }
      ops.push(audit('revoke', releaseId(fid, fw.version), 'EMERGENCY REVOKE digest ' + digest.slice(0, 12) + ': ' + reason));
      return finish(ops, null);
    }
    const rid = str(body.releaseId, 120);
    const cur = rid ? await deps.getRelease(rid) : null;
    if (!rid || !cur) return fail(404, 'Unknown release');
    if (body.expectedRev !== cur.rev) return fail(409, 'This release changed. Reload and try again.');
    const allowed = TRANSITIONS[action];
    const next = (patch: Partial<Release>): Release => ({ ...cur, ...patch, rev: cur.rev + 1 });
    const g = evaluateGates(cur.frameworkId, cur.reviews, w);

    if (action === 'review') {
      if (cur.state !== 'draft' && cur.state !== 'in-review') return fail(409, 'Reviews can only be recorded before approval');
      const role = body.role as ReviewRole; const reviewer = str(body.reviewer, 80); const note = body.note === undefined || body.note === '' ? '' : str(body.note, 300);
      if (!REVIEW_ROLES.includes(role) || !reviewer || note === null) return fail(400, 'A review needs a role, the reviewer\'s name and a note of at most 300 characters');
      if (cur.reviews.length >= 50) return fail(422, 'Too many reviews on this release');
      const rel = next({ reviews: [...cur.reviews, { role, reviewer, note, at, digest: g.digest! }], contentDigest: g.digest! });
      return finish([{ kind: 'release', value: rel, expectedRev: cur.rev }, audit('review', rid, role + ' review by ' + reviewer)], rel);
    }
    if (action === 'submit') {
      if (!allowed.includes(cur.state)) return fail(409, 'Only a draft can be submitted');
      const rel = next({ state: 'in-review', contentDigest: g.digest! });
      return finish([{ kind: 'release', value: rel, expectedRev: cur.rev }, audit('submit', rid, 'submitted for review')], rel);
    }
    const revokedNow = async (): Promise<boolean> => !!g.digest && (await deps.listRevocations()).some((r) => r.digest === g.digest);
    if (action === 'approve') {
      if (!allowed.includes(cur.state)) return fail(409, 'Only a release in review can be approved');
      if (await revokedNow()) return fail(409, 'This exact content was revoked and can never be approved. Change the content (it gets a new digest) and start again.');
      if (g.blockers.length) return fail(422, 'Gates not passed', g.blockers);
      const rel = next({ state: 'approved', approvedBy: a.userId, approvedAt: at, approvedDigest: g.digest!, contentDigest: g.digest! });
      return finish([{ kind: 'release', value: rel, expectedRev: cur.rev }, audit('approve', rid, 'approved digest ' + g.digest!.slice(0, 12))], rel);
    }
    if (action === 'publish' || action === 'rollback') {
      if (!allowed.includes(cur.state)) return fail(409, action === 'publish' ? 'Only an approved release can be published' : 'Only a previously published release can be rolled back to');
      if (action === 'rollback' && !cur.publishedAt) return fail(409, 'This release was never published');
      if (await revokedNow()) return fail(409, 'This exact content was revoked and can never be published again. Change the content (it gets a new digest) and start again.');
      if (g.blockers.length) return fail(422, 'Gates not passed', g.blockers);
      if (!cur.approvedDigest || cur.approvedDigest !== g.digest) return fail(409, action === 'publish' ? 'The pack changed after approval. Review and approve it again.' : 'The pack in this build differs from the one that was published. Roll back by deploying the build that shipped it, or review and approve the current pack.');
      const pointers = await deps.listCurrent();
      const prev = pointers.find((p) => p.frameworkId === cur.frameworkId) ?? null;
      const ops: Op[] = [];
      if (prev && prev.releaseId !== cur.id) {
        const old = await deps.getRelease(prev.releaseId);
        if (old && old.state === 'published') ops.push({ kind: 'release', value: { ...old, state: 'superseded', rev: old.rev + 1 }, expectedRev: old.rev });
      }
      const rel = next({ state: 'published', publishedBy: a.userId, publishedAt: at, archivedBy: null, archivedAt: null, archiveReason: null, contentDigest: g.digest! });
      ops.push({ kind: 'release', value: rel, expectedRev: cur.rev });
      ops.push({ kind: 'current', frameworkId: cur.frameworkId, value: { frameworkId: cur.frameworkId, releaseId: cur.id, version: cur.version, digest: g.digest!, publishedAt: at, publishedBy: a.userId }, expectedReleaseId: prev?.releaseId ?? null });
      ops.push(audit(action, rid, (action === 'publish' ? 'published ' : 'rolled back to ') + cur.version));
      return finish(ops, rel);
    }
    // archive
    if (!allowed.includes(cur.state)) return fail(409, 'This release is already archived');
    const reason = str(body.reason, 200); if (!reason || reason.length < 3) return fail(400, 'A reason is required');
    const pointers = await deps.listCurrent();
    const isCur = pointers.find((p) => p.frameworkId === cur.frameworkId && p.releaseId === cur.id);
    const rel = next({ state: 'archived', archivedBy: a.userId, archivedAt: at, archiveReason: reason });
    const ops: Op[] = [{ kind: 'release', value: rel, expectedRev: cur.rev }];
    if (isCur) ops.push({ kind: 'current', frameworkId: cur.frameworkId, value: null, expectedReleaseId: cur.id });
    ops.push(audit('archive', rid, reason));
    return finish(ops, rel);
  } catch { return fail(500, 'Could not complete the request. Nothing was changed.'); }
}
