// Phase 5: curriculum-aware Learning Worlds. Pure logic, no DOM. It only reorders and filters entries the app already has.
// It never invents an activity, never removes one from the Learning Library, and returns the app's own arrays untouched
// whenever there is no completed adult profile (existing users see exactly what they see today).
import { profilePublished } from './publishedGate.ts';
import { ACTIVITIES } from './activityRegistry.ts';
import { resolveProfile } from './countryRegistry.ts';
import { MAPPINGS } from './curriculumMappings.ts';
import { effectiveProfile } from './schoolConfig.ts';
import type { AdultProfile } from './onboardingService.ts';
import type { AgeBand, StorageLike } from './types.ts';

export const WORLDS_DISABLED_KEY = 'lgaAicsWorldsDisabled'; // '1' = show the original worlds for everyone

/** Which AICS activities sit behind each tab of the existing app. Every tab in the Learning Library must be listed. */
export const TAB_ACTIVITIES: Readonly<Record<string, readonly string[]>> = {
  lost: ['act.lit.lost-letters', 'act.lit.picture-rescue'],
  game: ['act.lit.abc'],
  phonics: ['act.lit.sounds'],
  words: ['act.lit.words'],
  draw: ['act.art.draw'],
  numbers: ['act.num.numbers'],
  addition: ['act.num.addition'],
  sorting: ['act.spa.sorting-draft'],
  patterns: ['act.pat.patterns-draft'],
  shapes: ['act.spa.shapes'],
  quest: ['act.pat.quests'],
  stories: ['act.lang.stories'],
  poems: ['act.lang.poems'],
  daily: ['act.dig.daily-discovery'],
  review: ['act.apl.memory-mission'],
  urdu: ['act.lit.urdu-letters'],
};

type Row = readonly unknown[];
const MATHS_COUNTRIES = ['GB-ENG', 'PK', 'AE']; // these countries write "Maths"

const bandsOf = (stage: string): AgeBand[] => (stage === 'A3' || stage === 'A4' || stage === 'A5' ? [stage] : ['A3', 'A4', 'A5']);

export interface WorldsPlan<G> {
  groups: G;
  /** Applies the plan to the app's own launch tiles. Same shape in, same shape out. */
  tiles: <T extends readonly Row[]>(defaults: T) => T;
  personalised: boolean;
}

function passthrough<G>(groups: G): WorldsPlan<G> {
  return { groups, tiles: (t) => t, personalised: false };
}

/** Core planner. `groups` are [id, label, [tab, emoji, title, description][]]. Throws nothing the caller cannot survive: see aicsWorlds. */
export function planWorlds<G extends readonly Row[]>(profile: AdultProfile | null, groups: G): WorldsPlan<G> {
  if (!profile || profile.status !== 'completed') return passthrough(groups);
  const bands = bandsOf(profile.stage);
  const langs = new Set<string>(profile.languages.length ? profile.languages : ['en']);
  const resolved = resolveProfile({ countryCode: profile.countryCode, frameworkId: profile.frameworkId });
  const fwIds = new Set([resolved.baseFrameworkId, ...resolved.overlayIds]);
  const rows = MAPPINGS.filter((m) => fwIds.has(m.frameworkId) && m.ageBands.some((b) => bands.includes(b)));
  const actById = new Map(ACTIVITIES.map((a) => [a.id, a]));

  const eligible = (tab: string): boolean => {
    const acts = TAB_ACTIVITIES[tab];
    if (!acts) return true; // unknown tab: never hide something we do not understand
    return acts.some((id) => {
      const a = actById.get(id);
      return !!a && a.ageBands.some((b) => bands.includes(b)) && a.languages.some((l) => langs.has(l));
    });
  };
  // Only activities that suit this child's age band AND language feed the score. An ineligible tab scores 0.
  const fits = (id: string): boolean => {
    const a = actById.get(id);
    return !!a && a.ageBands.some((b) => bands.includes(b)) && a.languages.some((l) => langs.has(l));
  };
  // Fit = how many distinct competencies of this pack the eligible activities support (then how many rows mention them).
  const score = (tab: string): number => {
    const acts = (TAB_ACTIVITIES[tab] ?? []).filter(fits).map((id) => actById.get(id)!);
    if (!acts.length) return 0;
    const referenced = new Set(rows.flatMap((r) => r.competencyIds));
    const supported = new Set(acts.flatMap((a) => a.competencyIds).filter((c) => referenced.has(c)));
    const actIds = acts.map((a) => a.id);
    return supported.size * 1000 + rows.filter((r) => r.activityIds.some((a) => actIds.includes(a))).length;
  };

  const entriesOf = (g: Row): Row[] => (Array.isArray(g[2]) ? (g[2] as Row[]) : []);
  const tabOf = (e: Row): string => String(e[0]);

  const newGroups = groups.map((g) => {
    const entries = entriesOf(g);
    const ok = entries.filter((e) => eligible(tabOf(e)));
    const rest = entries.filter((e) => !eligible(tabOf(e)));
    const label = g[0] === 'math' && MATHS_COUNTRIES.includes(profile.countryCode) ? 'Maths & Thinking' : g[1];
    return { id: g[0], total: ok.reduce((n, e) => n + score(tabOf(e)), 0), hasOk: ok.length > 0, row: [g[0], label, [...ok, ...rest]] as unknown as Row };
  });
  // Groups keep the app's order; only a group with nothing suitable for this child moves to the end.
  const order = newGroups.map((g, i) => ({ g, i })).sort((a, b) => Number(b.g.hasOk) - Number(a.g.hasOk) || a.i - b.i);
  const outGroups = order.map((x) => x.g.row) as unknown as G;

  // Safety net: the Learning Library must still hold exactly the same activities.
  const before = groups.flatMap((g) => entriesOf(g).map(tabOf)).sort().join('|');
  const after = (outGroups as readonly Row[]).flatMap((g) => entriesOf(g).map(tabOf)).sort().join('|');
  if (before !== after) return passthrough(groups);

  // Launch tiles: ONLY the app's own tiles (original artwork, classes and animation untouched). All of them always stay;
  // tiles that do not suit this child are demoted, never removed or replaced. Shape Lab is pinned to the first four slots.
  const PINNED = 'shapes';
  const PIN_MAX_INDEX = 3;
  const tiles = <T extends readonly Row[]>(defaults: T): T => {
    const idx = new Map(defaults.map((t, i) => [String(t[0]), i]));
    const order = [...defaults].sort((x, y) => {
      const ex = Number(eligible(String(x[0]))), ey = Number(eligible(String(y[0])));
      return ey - ex || score(String(y[0])) - score(String(x[0])) || idx.get(String(x[0]))! - idx.get(String(y[0]))!;
    });
    const at = order.findIndex((t) => String(t[0]) === PINNED);
    if (at > PIN_MAX_INDEX && eligible(PINNED)) order.splice(PIN_MAX_INDEX, 0, order.splice(at, 1)[0]);
    return order as unknown as T;
  };
  return { groups: outGroups, tiles, personalised: true };
}

/** What the app calls. Reads the adult profile from storage; any problem returns the app's own data unchanged. */
export function aicsWorlds<G extends readonly Row[]>(groups: G, storage?: StorageLike | null): WorldsPlan<G> {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s || s.getItem(WORLDS_DISABLED_KEY) === '1') return passthrough(groups);
    const profile = effectiveProfile(s);
    if (!profilePublished(profile, s)) return passthrough(groups); // Phase 8: Draft, unpublished or stale packs never reach children
    return planWorlds(profile, groups);
  } catch {
    return passthrough(groups);
  }
}
