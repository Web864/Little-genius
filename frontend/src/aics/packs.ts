import { ACTIVITIES } from './activityRegistry.ts';
import { COMPETENCIES } from './competencyRegistry.ts';
import { MAPPINGS } from './curriculumMappings.ts';
import { FRAMEWORKS, getFramework } from './curriculumRegistry.ts';
import type { AgeBand, Mapping, MappingStatus } from './types.ts';

export interface PackSummary {
  frameworkId: string;
  name: string;
  kind: 'base' | 'overlay';
  selectable: boolean;
  status: string;
  rows: number;
  outcomeRows: number;
  competencyRows: number;
  /** Finest level the pack maps to. */
  granularity: 'outcome' | 'competency' | 'area' | 'internal' | 'none';
  /** True when rows group several official outcomes that are not individually mapped. */
  detailedOutcomesPending: boolean;
  rowsByStatus: Partial<Record<MappingStatus, number>>;
  rowsWithActivities: number;
  /** Rows no existing activity supports. These are honest content gaps. */
  gapRowIds: string[];
  competenciesCovered: string[];
  /** Competencies in our registry that no row of this pack touches. */
  competenciesNotReferenced: string[];
  activitiesAvailable: string[];
  ageBands: AgeBand[];
  /** Why the pack cannot be published yet. Empty only when everything is verified and reviewed. */
  blockers: string[];
  publishable: boolean;
}

export const packRows = (frameworkId: string): Mapping[] => MAPPINGS.filter((m) => m.frameworkId === frameworkId);

/** Coverage is derived from the registries on every call; nothing is stored or hand-counted. */
export function buildPack(frameworkId: string): PackSummary | null {
  const fw = getFramework(frameworkId);
  if (!fw) return null;
  const rows = packRows(frameworkId);
  const rowsByStatus: Partial<Record<MappingStatus, number>> = {};
  for (const r of rows) rowsByStatus[r.status] = (rowsByStatus[r.status] ?? 0) + 1;
  const covered = [...new Set(rows.flatMap((r) => r.competencyIds))].sort();
  const acts = [...new Set(rows.flatMap((r) => r.activityIds))].sort();
  const known = new Set(ACTIVITIES.map((a) => a.id));
  const blockers: string[] = [];
  if (fw.status !== 'published') blockers.push('Framework status is ' + fw.status);
  if (fw.verification !== 'primary-verified' && fw.verification !== 'internal') blockers.push('Source verification is ' + fw.verification);
  if (fw.verification === 'primary-verified' && !fw.urlConfirmed) blockers.push('Source URL not confirmed');
  const unpublished = rows.filter((r) => r.status !== 'published').length;
  if (unpublished) blockers.push(unpublished + ' of ' + rows.length + ' mappings are not published');
  if (!fw.selectable) blockers.push('Tracked only; not yet effective');
  const bands = new Set<AgeBand>();
  for (const r of rows) for (const b of r.ageBands) bands.add(b);
  return {
    frameworkId, name: fw.name, kind: fw.kind, selectable: fw.selectable, status: fw.status,
    rows: rows.length, outcomeRows: rows.filter((r) => r.level === 'outcome').length,
    competencyRows: rows.filter((r) => r.level === 'competency').length,
    granularity: rows.some((r) => r.level === 'outcome') ? 'outcome' : rows.some((r) => r.level === 'competency') ? 'competency' : rows.some((r) => r.level === 'area') ? 'area' : rows.some((r) => r.level === 'internal') ? 'internal' : 'none',
    detailedOutcomesPending: rows.some((r) => r.level === 'competency' || r.level === 'area'),
    rowsByStatus,
    rowsWithActivities: rows.filter((r) => r.activityIds.some((a) => known.has(a))).length,
    gapRowIds: rows.filter((r) => r.activityIds.length === 0).map((r) => r.id),
    competenciesCovered: covered,
    competenciesNotReferenced: COMPETENCIES.map((c) => c.id).filter((c) => !covered.includes(c)),
    activitiesAvailable: acts,
    ageBands: (['A3', 'A4', 'A5'] as AgeBand[]).filter((b) => bands.has(b)),
    blockers, publishable: blockers.length === 0,
  };
}

export const listPacks = (): PackSummary[] => FRAMEWORKS.map((f) => buildPack(f.id)!).filter(Boolean);
