// Phase 7, priority 3 (server side logic). Dependency-injected so it is testable here and used unchanged by the backend routes
// (integration/backend/curriculumRoutes.ts is thin glue around these functions).
// Authorization never trusts the client: the school is found from the caller's OWN verified user id -> entitlement -> licence.
// The client sends no licence id, school id or role. Each school's configuration is stored under its own licence id only.
import { validateSchoolConfig } from './schoolConfig.ts';
import type { SchoolCurriculumConfig } from './schoolConfig.ts';

export interface LicenceRec { id: string; email: string; expiresAt: string; revoked: boolean }
export interface Deps {
  getEntitlement(userId: string): Promise<{ licenceId: string } | null>;
  getLicence(licenceId: string): Promise<LicenceRec | null>;
  getConfig(licenceId: string): Promise<SchoolCurriculumConfig | null>;
  /** Compare-and-set on `version` (null = must not exist). Returns false if someone else changed it first. */
  putConfig(licenceId: string, config: SchoolCurriculumConfig, expectedVersion: number | null): Promise<boolean>;
  now(): number;
}
export interface Caller { userId?: string; email?: string }
export type Outcome<T> = { ok: true; value: T } | { ok: false; status: 400 | 401 | 403 | 409; error: string };

/** read: any account linked to an active licence. write: only the verified licence-holder e-mail (same rule as the existing school profile). */
export async function authorizeSchool(caller: Caller, deps: Deps, action: 'read' | 'write'): Promise<Outcome<{ licence: LicenceRec; canEdit: boolean }>> {
  if (!caller.userId) return { ok: false, status: 401, error: 'Sign in required.' };
  const link = await deps.getEntitlement(caller.userId);
  if (!link) return { ok: false, status: 403, error: 'Active school licence required.' };
  const licence = await deps.getLicence(link.licenceId);
  if (!licence || licence.revoked || !(Date.parse(licence.expiresAt) > deps.now())) return { ok: false, status: 403, error: 'Active school licence required.' };
  const canEdit = !!caller.email && licence.email === caller.email.toLowerCase();
  if (action === 'write' && !canEdit) return { ok: false, status: 403, error: 'Only the licence holder can change school curriculum settings.' };
  return { ok: true, value: { licence, canEdit } };
}

export async function getSchoolCurriculum(caller: Caller, deps: Deps): Promise<Outcome<{ config: SchoolCurriculumConfig | null; licensedUntil: string; canEdit: boolean }>> {
  const a = await authorizeSchool(caller, deps, 'read');
  if (!a.ok) return a;
  const config = await deps.getConfig(a.value.licence.id);
  return { ok: true, value: { config, licensedUntil: a.value.licence.expiresAt, canEdit: a.value.canEdit } };
}

export async function putSchoolCurriculum(caller: Caller, body: unknown, deps: Deps): Promise<Outcome<{ config: SchoolCurriculumConfig }>> {
  const a = await authorizeSchool(caller, deps, 'write'); // authorize BEFORE looking at the body
  if (!a.ok) return a;
  const v = validateSchoolConfig(body);
  if (!v.ok) return { ok: false, status: 400, error: v.errors.slice(0, 3).join('; ') };
  const current = await deps.getConfig(a.value.licence.id);
  const sent = v.config.version ?? 0;
  if ((current?.version ?? 0) !== sent) return { ok: false, status: 409, error: 'Settings changed elsewhere; refresh and try again.' };
  const next: SchoolCurriculumConfig = { ...(v.config as SchoolCurriculumConfig), version: sent + 1, updatedAt: new Date(deps.now()).toISOString() };
  const ok = await deps.putConfig(a.value.licence.id, next, current ? current.version : null);
  if (!ok) return { ok: false, status: 409, error: 'Settings changed elsewhere; refresh and try again.' };
  return { ok: true, value: { config: next } };
}
