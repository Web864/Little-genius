// AICS shared types. Pure data: no DOM access, no network, no side effects.

export type ReviewStatus = 'draft' | 'under-review' | 'approved' | 'published' | 'archived';
export type MappingStatus = ReviewStatus | 'pending-source';
export type Verification = 'primary-verified' | 'partial' | 'secondary-only' | 'internal';
export type AgeBand = 'A3' | 'A4' | 'A5';
export const AGE_BANDS: readonly AgeBand[] = ['A3', 'A4', 'A5'];

/** Named native educator who approved an item. Required before approved/published. */
export interface Reviewer {
  name: string;
  role: string;
  date: string; // YYYY-MM-DD
}

export interface Domain {
  id: string; // lower-case code, e.g. "lit"
  code: string; // display code, e.g. "LIT"
  name: string;
  optionalModule: boolean;
}

export interface Competency {
  id: string; // cmp.<domain>.<strand>.<n>  (stable, never renumbered)
  domain: string;
  strand: string;
  title: string;
  status: ReviewStatus;
  reviewer: Reviewer | null;
}

export type FrameworkKind = 'base' | 'overlay';

export interface Framework {
  id: string;
  name: string;
  kind: FrameworkKind;
  countries: string[]; // country codes where it can apply
  version: string;
  effectiveDate: string | null; // YYYY-MM-DD, or a free label via effectiveNote
  effectiveNote: string;
  verifiedDate: string | null; // YYYY-MM-DD
  verification: Verification;
  sourceUrl: string | null;
  urlConfirmed: boolean; // false = URL must be re-confirmed before publishing
  selectable: boolean; // false = tracked only (approved but not yet effective)
  status: ReviewStatus;
  reviewer: Reviewer | null;
  notes: string;
}

export type JurisdictionApplicability =
  | 'binding'
  | 'adopted-administratively'
  | 'policy-verified'
  | 'unverified';

export interface Jurisdiction {
  code: string;
  name: string;
  applicability: JurisdictionApplicability;
  note: string;
}

export interface Country {
  code: string;
  name: string;
  status: 'launch' | 'default' | 'future';
  defaultFrameworkId: string | null;
  frameworkIds: string[];
  overlayIds: string[];
  jurisdictions: Jurisdiction[];
  languages: string[]; // BCP-47 tags the pack may offer (content still Draft)
}

/** area = whole learning area; competency = an official competency that groups several outcomes (the detailed outcomes are not mapped); outcome = an official goal or single outcome; internal = our own competency (International Core). */
export type MappingLevel = 'area' | 'competency' | 'outcome' | 'internal';

export interface Mapping {
  id: string;
  level: MappingLevel;
  frameworkId: string;
  sourceRef: string; // official area/competency name as read from the source
  officialOutcomeRef: string | null; // official goal/competency reference; null for area and internal rows
  ageBands: AgeBand[];
  domainIds: string[];
  competencyIds: string[];
  activityIds: string[];
  status: MappingStatus;
  reviewer: Reviewer | null;
  note: string; // our own short paraphrase and caveats. Never official text.
}

export interface Activity {
  id: string; // act.<domain>.<slug>
  name: string;
  domainIds: string[];
  competencyIds: string[];
  ageBands: AgeBand[];
  languages: string[];
  digital: boolean; // false = adult-led / offline suggestion
  legacyKey: string | null; // localStorage key that holds today's progress
  contentStatus: 'existing' | ReviewStatus;
  reviewNote: string;
}

/** Minimal Storage surface so migration is testable without a browser. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
