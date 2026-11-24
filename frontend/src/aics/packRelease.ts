import { ACTIVITIES } from './activityRegistry.ts';
import { MAPPINGS } from './curriculumMappings.ts';
import { FRAMEWORKS } from './curriculumRegistry.ts';
import { sha256Hex } from './sha256.ts';
import type { Activity, Framework, Mapping, Reviewer } from './types.ts';
import { validateRegistries } from './validate.ts';

// Phase 8: release ledger rules for curriculum packs. Pure logic, no storage, no network: the owner service (ownerCurriculum.ts) persists it.
// The registries in code stay Draft. A pack reaches children only when (1) the owner's ledger says "published", (2) every gate below passes,
// and (3) the digest of the pack as shipped in THIS build equals the digest that was approved. Any change to the pack changes the digest and
// silently withdraws the publication (fail closed) until it is reviewed again.

/** The registries a pack is judged against. Production always uses the real ones; tests pass a fixture. */
export interface World { frameworks: readonly Framework[]; mappings: readonly Mapping[]; activities: readonly Activity[] }
export const REAL_WORLD: World = { frameworks: FRAMEWORKS, mappings: MAPPINGS, activities: ACTIVITIES };
const fwOf = (w: World, id: string): Framework | undefined => w.frameworks.find((f) => f.id === id);

export type ReleaseState = 'draft' | 'in-review' | 'approved' | 'published' | 'superseded' | 'archived';
export type ReviewRole = 'educator' | 'primary-source' | 'native-educator';
export const REVIEW_ROLES: readonly ReviewRole[] = ['educator', 'primary-source', 'native-educator'];

/** Owner-recorded review. Credentials cannot be verified by the app: this is a record of who the owner says reviewed, never proof. */
export interface ReviewEntry { role: ReviewRole; reviewer: string; note: string; at: string; digest: string }

export interface Release {
  id: string; // "<frameworkId>@<version>"
  frameworkId: string;
  version: string;
  state: ReleaseState;
  contentDigest: string; // digest when created or last refreshed
  reviews: ReviewEntry[];
  createdBy: string; createdAt: string;
  approvedBy: string | null; approvedAt: string | null; approvedDigest: string | null;
  publishedBy: string | null; publishedAt: string | null;
  archivedBy: string | null; archivedAt: string | null; archiveReason: string | null;
  rev: number; // optimistic concurrency
}

export interface CurrentPointer { frameworkId: string; releaseId: string; version: string; digest: string; publishedAt: string; publishedBy: string }

/** Permanent, per content digest. A revoked digest can never be approved, published or rolled back to; fixing the content changes the digest. */
export interface Revocation { digest: string; frameworkId: string; at: string; by: string; reason: string }

export const releaseId = (frameworkId: string, version: string): string => frameworkId + '@' + version;

const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;

/** Fields that define what a child could see. Review bookkeeping (status, reviewer) is excluded so approving does not change the digest. */
function digestInput(w: World, fw: Framework, rows: readonly Mapping[]): unknown {
  const acts = new Map(w.activities.map((a) => [a.id, a]));
  const linked = [...new Set(rows.flatMap((r) => r.activityIds))].sort().map((id) => {
    const a = acts.get(id);
    return a ? { id: a.id, languages: [...a.languages].sort(), ageBands: [...a.ageBands].sort(), competencyIds: [...a.competencyIds].sort(), contentStatus: a.contentStatus } : { id, missing: true };
  });
  return stable({
    framework: { id: fw.id, version: fw.version, kind: fw.kind, countries: fw.countries, verification: fw.verification, sourceUrl: fw.sourceUrl, urlConfirmed: fw.urlConfirmed, selectable: fw.selectable, effectiveDate: fw.effectiveDate },
    rows: [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => ({ id: r.id, level: r.level, sourceRef: r.sourceRef, officialOutcomeRef: r.officialOutcomeRef, ageBands: r.ageBands, domainIds: r.domainIds, competencyIds: r.competencyIds, activityIds: r.activityIds, note: r.note })),
    linked,
  });
}

export function contentDigest(frameworkId: string, w: World = REAL_WORLD): string | null {
  const fw = fwOf(w, frameworkId);
  if (!fw) return null;
  return sha256Hex(JSON.stringify(digestInput(w, fw, w.mappings.filter((m) => m.frameworkId === frameworkId))));
}

const regional = (l: string): boolean => l === 'ur' || l === 'ar';

export function requiredRoles(frameworkId: string, w: World = REAL_WORLD): ReviewRole[] {
  const fw = fwOf(w, frameworkId);
  if (!fw) return [];
  const roles: ReviewRole[] = ['educator'];
  if (fw.verification === 'primary-verified') roles.push('primary-source');
  const acts = new Map(w.activities.map((a) => [a.id, a]));
  const ids = new Set(w.mappings.filter((m) => m.frameworkId === frameworkId).flatMap((m) => m.activityIds));
  if ([...ids].some((id) => acts.get(id)?.languages.some(regional))) roles.push('native-educator');
  return roles;
}

const today = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '1970-01-01');

export interface GateResult { digest: string | null; blockers: string[]; requiredRoles: ReviewRole[]; missingRoles: ReviewRole[] }

/**
 * Every reason this pack may not be approved or published right now. Empty blockers = all gates pass.
 * Reuses validateRegistries on a candidate registry in which the pack and its rows are marked published with the ledger's reviewer, so the
 * existing publish rules (verification, confirmed URL, reviewer, every row published, official refs, Urdu stays draft...) apply unchanged.
 */
export function evaluateGates(frameworkId: string, reviews: readonly ReviewEntry[], w: World = REAL_WORLD): GateResult {
  const fw = fwOf(w, frameworkId);
  if (!fw) return { digest: null, blockers: ['Unknown framework ' + frameworkId], requiredRoles: [], missingRoles: [] };
  const digest = contentDigest(frameworkId, w)!;
  const blockers: string[] = [];
  if (!fw.selectable) blockers.push('Tracked only: not yet effective, cannot be published');
  const rows = w.mappings.filter((m) => m.frameworkId === frameworkId);
  if (rows.length === 0) blockers.push('No mappings');
  for (const r of rows) if (r.status === 'pending-source') blockers.push('Mapping ' + r.id + ' is still pending its official source');
  const acts = new Map(w.activities.map((a) => [a.id, a]));
  for (const id of [...new Set(rows.flatMap((r) => r.activityIds))].sort()) {
    const a = acts.get(id);
    if (!a) blockers.push('Linked activity ' + id + ' does not exist');
    else if (a.contentStatus === 'draft') blockers.push('Linked activity ' + id + ' is Draft content');
  }
  const need = requiredRoles(frameworkId, w);
  const valid = reviews.filter((r) => r.digest === digest && r.reviewer.trim() && REVIEW_ROLES.includes(r.role));
  const missing = need.filter((role) => !valid.some((r) => r.role === role));
  for (const role of missing) blockers.push('Missing ' + role + ' review for the current content');
  const educator = valid.filter((r) => r.role === 'educator').sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const reviewer: Reviewer | null = educator ? { name: educator.reviewer.trim(), role: 'educator (owner-recorded)', date: today(educator.at) } : null;
  const candidateFw: Framework[] = w.frameworks.map((f) => (f.id === frameworkId ? { ...f, status: 'published' as const, reviewer } : f));
  const candidateRows: Mapping[] = w.mappings.map((m) => (m.frameworkId === frameworkId ? { ...m, status: 'published' as const, reviewer } : m));
  const ids = new Set(rows.map((r) => r.id));
  for (const e of validateRegistries({ frameworks: candidateFw, mappings: candidateRows, activities: w.activities })) {
    if (e.includes(frameworkId) || [...ids].some((i) => e.includes(i))) blockers.push(e);
  }
  return { digest, blockers: [...new Set(blockers)], requiredRoles: need, missingRoles: missing };
}

export const newRelease = (frameworkId: string, version: string, digest: string, by: string, at: string): Release => ({
  id: releaseId(frameworkId, version), frameworkId, version, state: 'draft', contentDigest: digest, reviews: [], createdBy: by, createdAt: at,
  approvedBy: null, approvedAt: null, approvedDigest: null, publishedBy: null, publishedAt: null, archivedBy: null, archivedAt: null, archiveReason: null, rev: 1,
});

/** Allowed state changes. publish/rollback both end in 'published'; the service decides which one applies. */
export const TRANSITIONS: Record<string, readonly ReleaseState[]> = {
  submit: ['draft'], approve: ['in-review'], publish: ['approved'], rollback: ['superseded', 'archived'], archive: ['draft', 'in-review', 'approved', 'published', 'superseded'],
};
