import { ACTIVITIES, evaluateGates } from '../../src/aics/index.ts';
import type { Activity, AuditEntry, CurrentPointer, Framework, Mapping, OwnerDeps, Op, Release, Revocation, World } from '../../src/aics/index.ts';

// Shared in-memory ledger and fixture pack for the release, revocation and backend-route tests. NOT a real database.
// ---------------------------------------------------------------- fixtures: a pack that CAN pass every gate, so the flow is testable
export const GOOD_ACT: Activity = { ...ACTIVITIES.find((a) => a.contentStatus === 'existing' && a.languages.length === 1 && a.languages[0] === 'en')!, id: 'act.fx.counting' };
export const fwOf = (over: Partial<Framework> = {}): Framework => ({ id: 'fx-pack', name: 'Fixture pack', kind: 'base', countries: ['INTL'], version: '1.0', effectiveDate: null, effectiveNote: '', verifiedDate: '2026-11-01', verification: 'internal', sourceUrl: null, urlConfirmed: false, selectable: true, status: 'draft', reviewer: null, notes: '', ...over });
export const rowOf = (id: string, over: Partial<Mapping> = {}): Mapping => ({ id, level: 'area', frameworkId: 'fx-pack', sourceRef: 'Maths', officialOutcomeRef: null, ageBands: ['A4'], domainIds: [GOOD_ACT.domainIds[0]], competencyIds: [GOOD_ACT.competencyIds[0]], activityIds: [GOOD_ACT.id], status: 'draft', reviewer: null, note: 'Our own short note.', ...over });
export const world = (o: { fw?: Partial<Framework>; rows?: Mapping[]; acts?: Activity[] } = {}): World => ({ frameworks: [fwOf(o.fw)], mappings: o.rows ?? [rowOf('map.fx.a'), rowOf('map.fx.b')], activities: o.acts ?? [GOOD_ACT] });
export const fixtureHasNoBlockers = (w: World): string[] => evaluateGates('fx-pack', [], w).blockers.filter((b) => !b.startsWith('Missing ') && !b.includes('without reviewer') && !/mapping .* is draft|but mapping/.test(b));

export class Ledger implements OwnerDeps {
  releases = new Map<string, Release>(); current = new Map<string, CurrentPointer>(); audit: AuditEntry[] = []; revocations = new Map<string, Revocation>(); failRevList = false;
  failCommit = false; commits = 0; w: World; n = 0; t = 0;
  constructor(w: World) { this.w = w; }
  get world(): World { return this.w; }
  async getRelease(id: string) { const r = this.releases.get(id); return r ? structuredClone(r) : null; }
  async listReleases() { return [...this.releases.values()].map((r) => structuredClone(r)); }
  async listCurrent() { return [...this.current.values()].map((c) => structuredClone(c)); }
  async listAudit(limit: number) { return this.audit.slice(-limit).reverse(); }
  async listRevocations() { if (this.failRevList) throw new Error('db down'); return [...this.revocations.values()].map((r) => structuredClone(r)); }
  async commit(ops: Op[]) {
    if (this.failCommit) throw new Error('db down');
    // validate every compare-and-set first, then apply: all or nothing
    for (const o of ops) {
      if (o.kind === 'release') { const cur = this.releases.get(o.value.id); if ((cur?.rev ?? null) !== o.expectedRev) return false; }
      if (o.kind === 'current') { if ((this.current.get(o.frameworkId)?.releaseId ?? null) !== o.expectedReleaseId) return false; }
    }
    this.commits++;
    for (const o of ops) {
      if (o.kind === 'release') this.releases.set(o.value.id, structuredClone(o.value));
      else if (o.kind === 'current') { if (o.value) this.current.set(o.frameworkId, structuredClone(o.value)); else this.current.delete(o.frameworkId); }
      else if (o.kind === 'revocation') { if (!this.revocations.has(o.value.digest)) this.revocations.set(o.value.digest, structuredClone(o.value)); }
      else this.audit.push(o.value);
    }
    return true;
  }
  newId() { return 'a' + (++this.n); }
  now() { return '2026-11-22T10:' + String(this.t++ % 60).padStart(2, '0') + ':00.000Z'; }
}
export const OWNER = { userId: 'u-owner', role: 'owner' };
