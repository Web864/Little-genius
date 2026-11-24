import type { Framework } from './types.ts';

// Source registry. Every framework starts as Draft; none may be published until the
// outstanding verification noted in `notes` is complete (owner condition 3).
export const FRAMEWORKS: readonly Framework[] = [
  {
    id: 'intl-core', name: 'International Core (Little Genius)', kind: 'base', countries: ['INTL'],
    version: '0.1.0-draft', effectiveDate: null, effectiveNote: 'Internal framework, not an official curriculum',
    verifiedDate: null, verification: 'internal', sourceUrl: null, urlConfirmed: false,
    selectable: true, status: 'draft', reviewer: null,
    notes: 'Built from common competencies in EYFS, SNC ECCE, Head Start ELOF, EYLF V2.0 and NCF-FS. Never labelled as official.',
  },
  {
    id: 'eyfs-2026', name: 'England EYFS statutory framework', kind: 'base', countries: ['GB-ENG'],
    version: '13 Jul 2026', effectiveDate: '2026-09-01', effectiveNote: 'Supersedes the 2025 version',
    verifiedDate: '2026-11-22', verification: 'primary-verified',
    sourceUrl: 'https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2',
    urlConfirmed: true, selectable: true, status: 'draft', reviewer: null,
    notes: 'Primary PDF read on 2026-11-22; gov.uk publication URL confirmed. All 17 Early Learning Goals imported as outcome rows (titles, page ranges and our own paraphrase only; page numbers come from text extraction and may be off by one). Development Matters and Birth to 5 Matters are not part of this source.',
  },
  {
    id: 'snc-ecce-2020', name: 'Pakistan SNC ECCE Grade Pre-I', kind: 'base', countries: ['PK'],
    version: '2020', effectiveDate: null, effectiveNote: 'Current adopted text; binding only in Islamabad (ICT)',
    verifiedDate: '2026-11-22', verification: 'partial',
    sourceUrl: 'https://www.unique.edu.pk/Content/pdf/DownloadFilesForRnDWebpage/SNC%202020%20Early%20childhood%20care%20and%20education%20grade%20pre-I.pdf',
    urlConfirmed: false, selectable: true, status: 'draft', reviewer: null,
    notes: 'Learning areas 2.4–2.10 imported as 39 COMPETENCY-level rows (each groups lettered outcomes; individual outcomes are not mapped and stay pending educator review; the source has no formal outcome codes). 2.1 is an overview and 2.2/2.3 are method sections, not learning areas. 2.7 C6 letter range not confirmed. Outcome text itself was not copied. URL is a hosted copy (unique.edu.pk); NCC official hosting of SNC 2020 ECCE not confirmed, so urlConfirmed stays false.',
  },
  {
    id: 'pk-nncp-2026', name: 'Pakistan NNCP 2026 (federal)', kind: 'base', countries: ['PK'],
    version: '2026', effectiveDate: null, effectiveNote: 'Approved; implementation 2027–28 for Islamabad/federal institutions',
    verifiedDate: '2026-11-22', verification: 'partial', sourceUrl: 'https://ncc.gov.pk/SiteImage/Misc/files/ECCE(1).pdf', urlConfirmed: true,
    selectable: false, status: 'draft', reviewer: null,
    notes: 'NCC-hosted ECCE PDF read in part (first ~100k of ~270k characters). Text calls itself a "proposed ECCE curriculum 2026"; no draft/approved label, notification number, version, age band or applicability stated. Status conflicts between press (approved) and a feedback call (Oct 2026): UNRESOLVED. Seven learning areas (PSED, LL, BN, WAU, HHNS, CA, PD); counts verified only for PSED (39) and LL (60). Tracked only; do not mix with SNC 2020.',
  },
  {
    id: 'pk-punjab-2027', name: 'Punjab new curriculum (ECE–Grade 5)', kind: 'base', countries: ['PK'],
    version: '2026 approval', effectiveDate: null, effectiveNote: 'Approved 24 Sep 2026; new books April 2027',
    verifiedDate: '2026-11-22', verification: 'secondary-only', sourceUrl: null, urlConfirmed: false,
    selectable: false, status: 'draft', reviewer: null,
    notes: 'Tracked only. News/ministry press only; primary notification not obtained. KP and Balochistan ECCE adoption unverified.',
  },
  {
    id: 'uae-moe-kg-overlay', name: 'UAE MoE KG mandatory subjects overlay', kind: 'overlay', countries: ['AE'],
    version: 'Policy from 2025–26', effectiveDate: null, effectiveNote: 'In force from 2025–26 for all private KGs',
    verifiedDate: '2026-11-22', verification: 'partial', sourceUrl: null, urlConfirmed: false,
    selectable: true, status: 'draft', reviewer: null,
    notes: 'ADEK KG MoE Subjects Policy v1.0 (Jul 2025) verified from the primary policy. MoE guide read only from a school-hosted copy (Arabic 200 min/week; Islamic Education 90 min for Muslim children; partly garbled), official MoE URL not obtained. KHDA PDFs read: Arabic early-childhood policy (birth–6, Arabic teacher present for at least one-third of instructional time, phase 1 ages 4–6 from Sep 2025/Apr 2026) and mandatory-subjects requirements (40-minute unit, separate Arab/non-Arab classes, from 2025-26); neither states KG minutes. Sharjah rule not found. Subject-level rows only; outcome-level text of the MoE guide is not verified. Overlay applies on top of any base curriculum.',
  },
];

export const getFramework = (id: string): Framework | undefined => FRAMEWORKS.find((f) => f.id === id);
