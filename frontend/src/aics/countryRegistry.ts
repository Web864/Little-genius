import type { Country } from './types.ts';
import { getFramework } from './curriculumRegistry.ts';

export const COUNTRIES: readonly Country[] = [
  {
    code: 'INTL', name: 'International (default)', status: 'default',
    defaultFrameworkId: 'intl-core', frameworkIds: ['intl-core'], overlayIds: [],
    jurisdictions: [], languages: ['en', 'ur'],
  },
  {
    code: 'GB-ENG', name: 'England', status: 'launch',
    defaultFrameworkId: 'eyfs-2026', frameworkIds: ['eyfs-2026', 'intl-core'], overlayIds: [],
    jurisdictions: [
      { code: 'GB-ENG', name: 'England (all)', applicability: 'binding',
        note: 'EYFS is statutory for registered early-years providers and schools in England. Not Scotland, Wales or Northern Ireland.' },
    ],
    languages: ['en'],
  },
  {
    code: 'PK', name: 'Pakistan', status: 'launch',
    defaultFrameworkId: 'snc-ecce-2020', frameworkIds: ['snc-ecce-2020', 'intl-core'], overlayIds: [],
    jurisdictions: [
      { code: 'PK-ICT', name: 'Islamabad Capital Territory', applicability: 'binding', note: 'SNC 2020 binding. NNCP 2026 effective 2027–28 (tracked only).' },
      { code: 'PK-PB', name: 'Punjab', applicability: 'adopted-administratively', note: 'Notified SNC Pre-I–V on 4 Jan 2021; new curriculum approved 24 Sep 2026, books April 2027 (tracked only).' },
      { code: 'PK-KP', name: 'Khyber Pakhtunkhwa', applicability: 'adopted-administratively', note: 'Primary notification not seen.' },
      { code: 'PK-SD', name: 'Sindh', applicability: 'unverified', note: 'Reported to differ from SNC. Unverified.' },
      { code: 'PK-BA', name: 'Balochistan', applicability: 'unverified', note: 'Unverified.' },
    ],
    languages: ['en', 'ur'],
  },
  {
    code: 'AE', name: 'United Arab Emirates', status: 'launch',
    defaultFrameworkId: 'intl-core', frameworkIds: ['intl-core'], overlayIds: ['uae-moe-kg-overlay'],
    jurisdictions: [
      { code: 'AE-AZ', name: 'Abu Dhabi (ADEK)', applicability: 'policy-verified', note: 'ADEK KG MoE Subjects Policy v1.0 (Jul 2025): 240 min/week Arabic Pre-KG–KG2.' },
      { code: 'AE-DU', name: 'Dubai (KHDA)', applicability: 'unverified', note: 'Parent guidance seen; primary rules not verified.' },
      { code: 'AE-SH', name: 'Sharjah', applicability: 'unverified', note: 'Unverified.' },
      { code: 'AE-OT', name: 'Other emirates', applicability: 'unverified', note: 'Unverified.' },
    ],
    languages: ['ar', 'en'],
  },
];

// Future expansion: recorded only. No frameworks, no claims, not researched.
export const FUTURE_MARKETS: readonly string[] = [
  'Scotland', 'Wales', 'Northern Ireland', 'Canada (provinces)', 'New Zealand', 'Saudi Arabia', 'Qatar',
  'Singapore', 'Malaysia', 'Finland', 'Germany', 'France', 'Japan', 'China', 'South Africa',
  'US state standards', 'India (state SCERTs)', 'Australia (state variants)', 'School-defined inquiry themes (IB-style)',
];

export const getCountry = (code: string): Country | undefined => COUNTRIES.find((c) => c.code === code);

export interface ResolveInput {
  countryCode?: string;
  frameworkId?: string;
}
export interface ResolvedProfile {
  countryCode: string;
  baseFrameworkId: string;
  overlayIds: string[];
  publishable: boolean; // true only when every framework used is Published
  warnings: string[];
}

/** Base framework + jurisdiction overlay. Unknown or unselectable input falls back to International Core. */
export function resolveProfile(input: ResolveInput = {}): ResolvedProfile {
  const warnings: string[] = [];
  let country = input.countryCode ? getCountry(input.countryCode) : undefined;
  if (input.countryCode && !country) warnings.push('Unknown country; using International Core.');
  if (!country) country = getCountry('INTL')!;

  let base = country.defaultFrameworkId ?? 'intl-core';
  if (input.frameworkId) {
    const f = getFramework(input.frameworkId);
    if (f && f.kind === 'base' && f.selectable && country.frameworkIds.includes(f.id)) base = f.id;
    else warnings.push('Requested framework is not available for this country; using the default.');
  }
  const overlays = country.overlayIds.filter((id) => getFramework(id)?.selectable);
  const used = [base, ...overlays].map((id) => getFramework(id));
  const publishable = used.every((f) => f?.status === 'published');
  if (!publishable) warnings.push('Pack is Draft and not for publication.');
  return { countryCode: country.code, baseFrameworkId: base, overlayIds: overlays, publishable, warnings };
}
