// An in-memory FAKE of the parts of @appdeploy/sdk that integration/backend/curriculumRoutes.ts uses. It follows the documented semantics
// (lazy tx handles, all-or-nothing transact, chosen-id adds returning null on collision, patch updates with literal top-level `if`,
// list attaching ids / get not attaching them, consistent reads) but it is NOT the real SDK. Tests that use it are route-logic tests,
// NOT real backend or authorization tests. Never import this from product code.
import { AsyncLocalStorage } from 'node:async_hooks';

type Rec = Record<string, unknown>;
export const store = {
  tables: new Map<string, Map<string, Rec>>(),
  users: new Map<string, { userId: string; email?: string }>(), // bearer token -> user
  roles: new Map<string, string>(), // userId -> role
  failListTable: null as string | null,
  failTransact: null as null | 'down' | 'unknown' | 'conflict',
  failAfterNthWrite: null as number | null, writes: 0, transacts: 0, pageLimit: 1000,
  reset(): void { this.tables.clear(); this.users.clear(); this.roles.clear(); this.failListTable = null; this.failTransact = null; this.failAfterNthWrite = null; this.writes = 0; this.transacts = 0; this.pageLimit = 1000; },
};
const tbl = (n: string): Map<string, Rec> => { let t = store.tables.get(n); if (!t) { t = new Map(); store.tables.set(n, t); } return t; };
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const checkTable = (n: string): void => { if (!NAME.test(n) || n.includes('__')) throw new Error('invalid table name ' + n); };

class DbError extends Error { __db = true; code: string; statusCode = 409; details: Rec = {}; constructor(code: string) { super(code); this.code = code; } }
export const isAppDatabaseError = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { __db?: boolean }).__db === true;

type Apply = (snap: Map<string, Map<string, Rec>>) => unknown;
interface Handle<T> extends PromiseLike<T> { __apply: Apply; __consumed: boolean }
function handle<T>(apply: Apply): Handle<T> {
  let p: Promise<T> | null = null;
  const h: Handle<T> = { __apply: apply, __consumed: false, then: (a, b) => { h.__consumed = true; p ??= Promise.resolve().then(() => runStandalone(apply) as T); return p.then(a, b); } };
  return h;
}
function runStandalone(apply: Apply): unknown { store.writes++; if (store.failAfterNthWrite !== null && store.writes > store.failAfterNthWrite) throw new DbError('AppDatabaseGatewayUnavailable'); return apply(store.tables); }
const snapTable = (snap: Map<string, Map<string, Rec>>, n: string): Map<string, Rec> => { let t = snap.get(n); if (!t) { t = new Map(); snap.set(n, t); } return t; };

export const db = {
  tx: {
    add: (table: string, records: Rec[]) => { checkTable(table); return handle<(string | null)[]>((snap) => records.map((r) => { const id = String(r.id); const t = snapTable(snap, table); if (t.has(id)) return null; t.set(id, structuredClone(r)); return id; })); },
    update: (table: string, items: { id: string; record: Rec; if?: Rec }[], options?: { patch?: boolean }) => { checkTable(table); return handle<boolean[]>((snap) => items.map((it) => {
      const t = snapTable(snap, table); const cur = t.get(it.id);
      if (options?.patch && !cur) return false;
      if (it.if) for (const [k, v] of Object.entries(it.if)) if (JSON.stringify(cur?.[k]) !== JSON.stringify(v)) return false;
      const next: Rec = options?.patch ? { ...(cur as Rec) } : {};
      for (const [k, v] of Object.entries(it.record)) { if (v === undefined) delete next[k]; else next[k] = structuredClone(v); }
      t.set(it.id, next); return true;
    })); },
    delete: (table: string, ids: string[]) => { checkTable(table); return handle<boolean[]>((snap) => ids.map((id) => snapTable(snap, table).delete(id))); },
  },
  async transact(ops: readonly Handle<unknown>[]): Promise<unknown[]> {
    for (const o of ops) if (o.__consumed) throw new DbError('AppDatabaseInvocationMismatch');
    store.transacts++;
    if (store.failTransact === 'down') throw new DbError('AppDatabaseGatewayUnavailable');
    if (store.failTransact === 'unknown') { // pretend it may have committed: apply, then report unknown
      const snap = new Map([...store.tables].map(([k, v]) => [k, new Map(v)])); for (const o of ops) o.__apply(snap); store.tables = snap as typeof store.tables; throw new DbError('AppDatabaseUnknownOutcome');
    }
    if (store.failTransact === 'conflict') throw new DbError('AppDatabaseConflict');
    const snap = new Map([...store.tables].map(([k, v]) => [k, new Map([...v].map(([id, r]) => [id, structuredClone(r)]))]));
    const results = ops.map((o) => o.__apply(snap));
    for (const r of results) if (Array.isArray(r) && r.some((x) => x === null || x === false)) throw new DbError('AppDatabaseConditionFailed');
    store.tables.clear(); for (const [k, v] of snap) store.tables.set(k, v);
    return results;
  },
  async get(table: string, ids: string[], _o?: { consistent?: boolean }): Promise<(Rec | null)[]> { checkTable(table); return ids.map((id) => { const r = tbl(table).get(id); if (!r) return null; const c = structuredClone(r); delete c.id; return c; }); },
  async list(table: string, o?: { limit?: number; nextToken?: string }): Promise<{ items: Rec[]; nextToken?: string }> {
    checkTable(table); if (store.failListTable === table) throw new DbError('AppDatabaseGatewayUnavailable');
    const all = [...tbl(table)].map(([id, r]) => ({ ...structuredClone(r), id })); const limit = Math.min(o?.limit ?? 50, store.pageLimit);
    return all.length > limit ? { items: all.slice(0, limit), nextToken: 't' } : { items: all };
  },
};

// ---- router, auth, roles
export interface Ctx { body: unknown; query: Record<string, string>; params: Record<string, string>; event: unknown; user?: { userId: string; email?: string }; role?: { role: string; scopes: string[]; source: string } }
type Res = { statusCode: number; headers: Record<string, string>; body: string };
type Mw = (c: Ctx) => Promise<Res | void> | Res | void;
export const json = (data: unknown, status = 200): Res => ({ statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
export const error = (message: string, status = 400): Res => json({ error: message }, status);
const LADDER = ['owner', 'admin', 'staff'];
export const requireAuth = (): Mw => (c) => {
  const h = (c.event as { headers?: Record<string, string> }).headers ?? {}; const tok = (h.authorization ?? '').replace(/^Bearer /, '');
  const u = store.users.get(tok); if (!u) return error('Unauthorized', 401); c.user = u;
};
export const requireRole = (min: string): Mw => (c) => {
  const r = c.user ? store.roles.get(c.user.userId) : undefined;
  if (!r || LADDER.indexOf(r) < 0 || LADDER.indexOf(r) > LADDER.indexOf(min)) return error('Forbidden', 403);
  c.role = { role: r, scopes: [], source: 'manual' };
};
export const router = (routes: Record<string, Mw[]>) => async (event: { method: string; path: string; headers?: Record<string, string>; body?: unknown }): Promise<Res> => {
  for (const [pat, chain] of Object.entries(routes)) {
    const [m, p] = pat.split(' '); if (m !== event.method) continue;
    const pp = p.split('/'), ap = event.path.split('/'); if (pp.length !== ap.length) continue;
    const params: Record<string, string> = {}; if (!pp.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = ap[i]), true) : seg === ap[i]))) continue;
    const ctx: Ctx = { body: event.body, query: {}, params, event };
    for (const mw of chain) { const out = await mw(ctx); if (out) return out; }
    return error('No response', 500);
  }
  return error('Not found', 404);
};
export const _als = new AsyncLocalStorage<unknown>();
