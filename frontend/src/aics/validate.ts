import { ACTIVITIES } from './activityRegistry.ts';
import { COMPETENCIES, DOMAINS } from './competencyRegistry.ts';
import { COUNTRIES } from './countryRegistry.ts';
import { FRAMEWORKS } from './curriculumRegistry.ts';
import { MAPPINGS } from './curriculumMappings.ts';
import type { Activity, Framework, Mapping, Reviewer } from './types.ts';
import { AGE_BANDS } from './types.ts';

const CMP_RE = /^cmp\.([a-z]+)\.([a-z]+)\.([0-9]+)$/;
const ACT_RE = /^act\.([a-z]+)\.[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const needsReviewer = (s: string): boolean => s === 'approved' || s === 'published';

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) out.push(id);
    seen.add(id);
  }
  return out;
}

function reviewerOk(r: Reviewer | null): boolean {
  return !!r && r.name.trim().length > 0 && r.role.trim().length > 0 && DATE_RE.test(r.date);
}

/**
 * Returns a list of problems. An empty list means the registries are internally consistent.
 * `over` lets the release gate ask "would this be consistent if these frameworks/mappings were published?" without touching the registries.
 */
export function validateRegistries(over?: { frameworks?: readonly Framework[]; mappings?: readonly Mapping[]; activities?: readonly Activity[] }): string[] {
  const FW = over?.frameworks ?? FRAMEWORKS;
  const MP = over?.mappings ?? MAPPINGS;
  const AC = over?.activities ?? ACTIVITIES;
  const errors: string[] = [];
  const domainIds = new Set(DOMAINS.map((d) => d.id));
  const cmpIds = new Set(COMPETENCIES.map((c) => c.id));
  const fwIds = new Set(FW.map((f) => f.id));
  const countryCodes = new Set(COUNTRIES.map((c) => c.code));

  for (const d of dupes(DOMAINS.map((x) => x.id))) errors.push('Duplicate domain ' + d);
  for (const d of dupes(COMPETENCIES.map((x) => x.id))) errors.push('Duplicate competency ' + d);
  for (const d of dupes(AC.map((x) => x.id))) errors.push('Duplicate activity ' + d);
  for (const d of dupes(FW.map((x) => x.id))) errors.push('Duplicate framework ' + d);
  for (const d of dupes(MP.map((x) => x.id))) errors.push('Duplicate mapping ' + d);
  if (DOMAINS.length !== 14) errors.push('Expected 14 domains, found ' + DOMAINS.length);

  for (const c of COMPETENCIES) {
    const match = CMP_RE.exec(c.id);
    if (!match) errors.push('Bad competency id ' + c.id);
    else if (match[1] !== c.domain || match[2] !== c.strand) errors.push('Competency id/field mismatch ' + c.id);
    if (!domainIds.has(c.domain)) errors.push('Competency ' + c.id + ' has unknown domain ' + c.domain);
    if (needsReviewer(c.status) && !reviewerOk(c.reviewer)) errors.push('Competency ' + c.id + ' ' + c.status + ' without reviewer');
  }

  for (const a of AC) {
    const match = ACT_RE.exec(a.id);
    if (!match) errors.push('Bad activity id ' + a.id);
    for (const d of a.domainIds) if (!domainIds.has(d)) errors.push('Activity ' + a.id + ' unknown domain ' + d);
    for (const c of a.competencyIds) if (!cmpIds.has(c)) errors.push('Activity ' + a.id + ' unknown competency ' + c);
    for (const b of a.ageBands) if (!AGE_BANDS.includes(b)) errors.push('Activity ' + a.id + ' bad age band ' + b);
    if (a.languages.includes('ur') && a.contentStatus !== 'draft') errors.push('Urdu activity ' + a.id + ' must stay draft');
  }

  for (const f of FW) {
    if (f.verifiedDate && !DATE_RE.test(f.verifiedDate)) errors.push('Framework ' + f.id + ' bad verifiedDate');
    if (f.effectiveDate && !DATE_RE.test(f.effectiveDate)) errors.push('Framework ' + f.id + ' bad effectiveDate');
    for (const c of f.countries) if (!countryCodes.has(c)) errors.push('Framework ' + f.id + ' unknown country ' + c);
    if (needsReviewer(f.status) && !reviewerOk(f.reviewer)) errors.push('Framework ' + f.id + ' ' + f.status + ' without reviewer');
    if (f.status === 'published') {
      if (f.verification !== 'primary-verified' && f.verification !== 'internal') errors.push('Framework ' + f.id + ' published without primary verification');
      if (f.verification === 'primary-verified' && (!f.sourceUrl || !f.urlConfirmed)) errors.push('Framework ' + f.id + ' published without a confirmed source URL');
    }
    if (f.verification === 'primary-verified' && !f.verifiedDate) errors.push('Framework ' + f.id + ' primary-verified without verifiedDate');
  }

  for (const c of COUNTRIES) {
    if (c.defaultFrameworkId && !fwIds.has(c.defaultFrameworkId)) errors.push('Country ' + c.code + ' unknown default framework');
    for (const f of [...c.frameworkIds, ...c.overlayIds]) if (!fwIds.has(f)) errors.push('Country ' + c.code + ' unknown framework ' + f);
    if (c.status === 'future' && (c.frameworkIds.length || c.overlayIds.length)) errors.push('Future country ' + c.code + ' must have no frameworks');
  }

  const fwById = new Map(FW.map((f) => [f.id, f]));
  const actById = new Map(AC.map((a) => [a.id, a]));
  const refs = new Set<string>();
  for (const mp of MP) {
    const fw = fwById.get(mp.frameworkId);
    if (!fw) errors.push('Mapping ' + mp.id + ' unknown framework ' + mp.frameworkId);
    for (const d of mp.domainIds) if (!domainIds.has(d)) errors.push('Mapping ' + mp.id + ' unknown domain ' + d);
    for (const c of mp.competencyIds) if (!cmpIds.has(c)) errors.push('Mapping ' + mp.id + ' unknown competency ' + c);
    for (const b of mp.ageBands) if (!AGE_BANDS.includes(b)) errors.push('Mapping ' + mp.id + ' bad age band ' + b);
    if (mp.status !== 'pending-source' && mp.ageBands.length === 0) errors.push('Mapping ' + mp.id + ' has no age bands');
    for (const a of mp.activityIds) {
      const act = actById.get(a);
      if (!act) errors.push('Mapping ' + mp.id + ' unknown activity ' + a);
      else if (!act.ageBands.some((b) => mp.ageBands.includes(b))) errors.push('Mapping ' + mp.id + ' activity ' + a + ' has no age band in common');
    }
    if (mp.status !== 'pending-source' && mp.domainIds.length === 0) errors.push('Mapping ' + mp.id + ' has no domains');
    if (mp.status === 'pending-source' && mp.competencyIds.length) errors.push('Mapping ' + mp.id + ' pending but has competencies');
    if (needsReviewer(mp.status) && !reviewerOk(mp.reviewer)) errors.push('Mapping ' + mp.id + ' ' + mp.status + ' without reviewer');
    if (needsReviewer(mp.status) && fw && fw.verification !== 'primary-verified' && fw.verification !== 'internal') {
      errors.push('Mapping ' + mp.id + ' ' + mp.status + ' but framework ' + fw.id + ' is not primary-verified');
    }
    if (mp.level === 'outcome' || mp.level === 'competency') {
      if (!mp.officialOutcomeRef) errors.push('Outcome mapping ' + mp.id + ' has no official outcome ref');
      else {
        const key = mp.frameworkId + '|' + mp.officialOutcomeRef;
        if (refs.has(key)) errors.push('Duplicate outcome ref ' + mp.officialOutcomeRef + ' in ' + mp.frameworkId);
        refs.add(key);
      }
      if (!mp.sourceRef.trim()) errors.push('Outcome mapping ' + mp.id + ' has no source reference');
      if (!mp.note.trim()) errors.push('Outcome mapping ' + mp.id + ' has no paraphrase');
      if (mp.competencyIds.length === 0) errors.push('Outcome mapping ' + mp.id + ' has no competencies');
    }
    if (mp.level === 'internal' && (mp.officialOutcomeRef !== null || mp.frameworkId !== 'intl-core')) errors.push('Internal mapping ' + mp.id + ' must be intl-core with no official ref');
    if (mp.level === 'area' && mp.officialOutcomeRef !== null) errors.push('Area mapping ' + mp.id + ' must not carry an outcome ref');
    if (mp.note.length > 240) errors.push('Mapping ' + mp.id + ' note is too long; keep paraphrases short and never copy official text');
    if (mp.status === 'published' && !mp.officialOutcomeRef && (mp.level === 'outcome' || mp.level === 'competency')) errors.push('Mapping ' + mp.id + ' published without official outcome ref');
  }
  for (const f of FW) {
    if (!needsReviewer(f.status)) continue;
    const rows = MP.filter((x) => x.frameworkId === f.id);
    if (rows.length === 0) errors.push('Framework ' + f.id + ' ' + f.status + ' with no mappings');
    for (const r of rows) if (!needsReviewer(r.status)) errors.push('Framework ' + f.id + ' ' + f.status + ' but mapping ' + r.id + ' is ' + r.status);
  }
  return errors;
}
