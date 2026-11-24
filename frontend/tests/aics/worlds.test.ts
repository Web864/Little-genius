import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ACTIVITIES, COUNTRIES, FRAMEWORKS, PROFILE_KEY, TAB_ACTIVITIES, WORLDS_DISABLED_KEY, aicsWorlds, planWorlds,
} from '../../src/aics/index.ts';
import type { AdultProfile, Lang, Stage } from '../../src/aics/index.ts';
import { V48_GROUPS, V48_TABS, V48_TILES } from './fixtures/worlds-v48.ts';
import { MemStore, markPublished, publishedCacheJson } from './helpers.ts';
import { LEARNING_V48, MAIN_V48 } from './fixtures/v48-anchors.ts';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const profile = (countryCode: string, frameworkId: string, stage: Stage, languages: Lang[], status: 'completed' | 'skipped' = 'completed'): AdultProfile =>
  ({ schema: 1, status, updatedAt: '2026-11-22T00:00:00.000Z', setting: 'home', countryCode, frameworkId, stage, languages, modules: [] });
const tabsOf = (groups: readonly (readonly unknown[])[]): string[] => groups.flatMap((g) => (g[2] as unknown[][]).map((e) => String(e[0])));
const stored = (p: AdultProfile): MemStore => { const s = new MemStore(); s.data.set(PROFILE_KEY, JSON.stringify(p)); return s; };

test('every activity is reachable through a Learning Library tab, and every library tab is a real app tab', () => {
  const reachable = new Set(Object.values(TAB_ACTIVITIES).flat());
  for (const a of ACTIVITIES) assert.ok(reachable.has(a.id), a.id + ' has no library tab');
  for (const t of tabsOf(V48_GROUPS)) {
    assert.ok(t in TAB_ACTIVITIES, t + ' missing from TAB_ACTIVITIES');
    assert.ok((V48_TABS as readonly string[]).includes(t), t + ' is not a tab of the app');
  }
  for (const [t] of V48_TILES) assert.ok((V48_TABS as readonly string[]).includes(t));
  for (const t of Object.keys(TAB_ACTIVITIES)) assert.ok(tabsOf(V48_GROUPS).includes(t), t + ' not in the library');
});

test('no profile, a skipped profile, a corrupt profile, a kill switch or no storage all leave the app exactly as it is today', () => {
  const g = V48_GROUPS; const t = V48_TILES;
  const same = (plan: ReturnType<typeof aicsWorlds>): void => {
    assert.strictEqual(plan.groups, g); assert.strictEqual(plan.tiles(t), t); assert.equal(plan.personalised, false);
  };
  same(aicsWorlds(g, new MemStore()));
  same(aicsWorlds(g, stored(profile('PK', 'snc-ecce-2020', 'A4', ['en'], 'skipped'))));
  const bad = new MemStore(); bad.data.set(PROFILE_KEY, '{not json'); same(aicsWorlds(g, bad));
  const killed = stored(profile('PK', 'snc-ecce-2020', 'A4', ['en'])); killed.data.set(WORLDS_DISABLED_KEY, '1'); same(aicsWorlds(g, killed));
  const throwing = new MemStore(); throwing.throwOnGet = true; same(aicsWorlds(g, throwing));
  same(aicsWorlds(g, null));
  same(planWorlds(null, g));
});

test('a completed profile never removes or adds a library entry, for every country, framework, stage and language mix', () => {
  const before = tabsOf(V48_GROUPS).sort();
  let combos = 0;
  for (const c of COUNTRIES.filter((x) => x.status !== 'future')) {
    for (const f of [...c.frameworkIds, 'intl-core', 'pk-nncp-2026', 'not-a-framework']) {
      for (const st of ['A3', 'A4', 'A5', 'mixed'] as Stage[]) {
        for (const l of [['en'], ['en', 'ur'], ['ur'], ['en', 'ar'], []] as Lang[][]) {
          const input = clone(V48_GROUPS);
          const plan = planWorlds({ ...profile(c.code, f, st, l) }, input as never);
          assert.deepEqual(tabsOf(plan.groups as never).sort(), before, [c.code, f, st, l].join());
          assert.equal(plan.groups.length, 4);
          combos++;
        }
      }
    }
  }
  assert.ok(combos > 100);
});

test('launch tiles: six distinct, real tabs, always include a letters or numbers activity, never hide behind an unsuitable age or language', () => {
  for (const c of COUNTRIES.filter((x) => x.status !== 'future')) {
    for (const st of ['A3', 'A4', 'A5', 'mixed'] as Stage[]) {
      for (const l of [['en'], ['en', 'ur'], []] as Lang[][]) {
        const p = profile(c.code, c.defaultFrameworkId ?? 'intl-core', st, l);
        const tiles = planWorlds(p, V48_GROUPS).tiles(V48_TILES);
        const ids = tiles.map((t) => t[0]);
        assert.equal(ids.length, 6); assert.equal(new Set(ids).size, 6);
        for (const id of ids) assert.ok((V48_TABS as readonly string[]).includes(id), id);
        assert.ok(ids.includes('game') || ids.includes('numbers'));
        assert.deepEqual([...ids].sort(), V48_TILES.map((t) => String(t[0])).sort(), 'all six original tiles always stay');
        assert.ok(ids.indexOf('shapes') <= 3, 'Shape Lab stays in the first four slots: ' + [c.code, st, l].join());
        if (!l.includes('ur')) assert.equal(ids[5], 'urdu', 'Urdu is demoted (not removed) for English-only profiles');
        if (st === 'A3') assert.ok(!ids.includes('addition'), 'addition is for ages 4–5 and up');
      }
    }
  }
});

test('Urdu tile is demoted (never removed) unless Urdu is chosen, and stays in the library either way', () => {
  const en = planWorlds(profile('PK', 'snc-ecce-2020', 'A4', ['en']), V48_GROUPS);
  const ur = planWorlds(profile('PK', 'snc-ecce-2020', 'A4', ['en', 'ur']), V48_GROUPS);
  const enT = en.tiles(V48_TILES), urT = ur.tiles(V48_TILES);
  assert.equal(enT[5][0], 'urdu'); assert.strictEqual(enT[5], V48_TILES.find((t) => t[0] === 'urdu'));
  assert.ok(urT.some((t) => t[0] === 'urdu'));
  assert.ok(tabsOf(en.groups as never).includes('urdu'));
  // The Urdu group has no suitable activity for an English-only child, so it moves last (it already is) and is never dropped.
  assert.equal((en.groups as readonly (readonly unknown[])[])[3][0], 'urdu');
});

test('age bands: Addition Garden is moved after the suitable activities for age 3–4 but is still listed', () => {
  const g = planWorlds(profile('INTL', 'intl-core', 'A3', ['en']), V48_GROUPS).groups as readonly (readonly unknown[])[];
  const math = g.find((x) => x[0] === 'math')![2] as unknown[][];
  assert.deepEqual(math.map((e) => e[0]), ['numbers', 'shapes', 'addition']);
  const a4 = planWorlds(profile('INTL', 'intl-core', 'A4', ['en']), V48_GROUPS).groups as readonly (readonly unknown[])[];
  assert.deepEqual((a4.find((x) => x[0] === 'math')![2] as unknown[][]).map((e) => e[0]), ['numbers', 'addition', 'shapes']);
});

test('curriculum changes the wording only where the curriculum does: "Maths" for England, Pakistan and UAE', () => {
  const label = (c: string, f: string): string => String((planWorlds(profile(c, f, 'A4', ['en']), V48_GROUPS).groups as readonly (readonly unknown[])[]).find((x) => x[0] === 'math')![1]);
  assert.equal(label('GB-ENG', 'eyfs-2026'), 'Maths & Thinking');
  assert.equal(label('PK', 'snc-ecce-2020'), 'Maths & Thinking');
  assert.equal(label('AE', 'intl-core'), 'Maths & Thinking');
  assert.equal(label('INTL', 'intl-core'), 'Math & Thinking');
});

test('the plan is driven by the pack: England and Pakistan produce different tile sets from International Core', () => {
  const sets = ['INTL|intl-core', 'GB-ENG|eyfs-2026', 'PK|snc-ecce-2020'].map((k) => {
    const [c, f] = k.split('|');
    return planWorlds(profile(c, f, 'A4', ['en', 'ur']), V48_GROUPS).tiles(V48_TILES).map((t) => t[0]).join(',');
  });
  assert.ok(new Set(sets).size >= 2, sets.join(' / '));
});

test('tiles are exactly the app\'s own objects: no emoji replacement tiles, original artwork untouched', () => {
  for (const c of ['INTL|intl-core', 'GB-ENG|eyfs-2026', 'PK|snc-ecce-2020']) {
    const [cc, f] = c.split('|');
    for (const st of ['A3', 'A4', 'A5', 'mixed'] as Stage[]) for (const l of [['en'], ['en', 'ur']] as Lang[][]) {
      const tiles = planWorlds(profile(cc, f, st, l), V48_GROUPS).tiles(V48_TILES);
      assert.equal(tiles.length, 6);
      for (const t of tiles) assert.strictEqual(t, V48_TILES.find((x) => x[0] === t[0]), 'identity-equal original tile');
    }
  }
});

test('Shape Lab is pinned to the launcher for every profile where it is eligible', () => {
  for (const c of COUNTRIES.filter((x) => x.status !== 'future')) for (const st of ['A3', 'A4', 'A5', 'mixed'] as Stage[]) for (const l of [['en'], ['en', 'ur'], ['ur']] as Lang[][]) {
    const ids = planWorlds(profile(c.code, c.defaultFrameworkId ?? 'intl-core', st, l), V48_GROUPS).tiles(V48_TILES).map((t) => t[0]);
    assert.ok(ids.includes('shapes') && ids.indexOf('shapes') <= 3, [c.code, st, l].join());
  }
});

test('ranking uses only age- and language-eligible activities', () => {
  // Urdu-only child: English-only tabs are ineligible and must rank after the Urdu tile.
  const ids = planWorlds(profile('PK', 'snc-ecce-2020', 'A4', ['ur']), V48_GROUPS).tiles(V48_TILES).map((t) => t[0]);
  assert.equal(ids[0], 'urdu', 'the only language-eligible tile ranks first');
  // Age 3–4: Addition Garden (4+) is ineligible, so it is demoted below every eligible tile.
  const a3 = planWorlds(profile('INTL', 'intl-core', 'A3', ['en']), V48_GROUPS).tiles(V48_TILES).map((t) => t[0]);
  assert.ok(a3.indexOf('urdu') > a3.indexOf('shapes'));
  assert.ok(!a3.slice(0, 3).includes('addition'));
});

test('inputs are never mutated and nothing is written to storage', () => {
  const g = clone(V48_GROUPS); const t = clone(V48_TILES);
  const frozen = JSON.stringify([g, t]);
  const s = markPublished(stored(profile('PK', 'snc-ecce-2020', 'A4', ['en', 'ur']))); s.resetCounters();
  const plan = aicsWorlds(g as never, s); plan.tiles(t as never);
  assert.equal(JSON.stringify([g, t]), frozen);
  assert.deepEqual(s.writes, []); assert.deepEqual(s.removes, []);
});

test('worlds code has no access to login, licence, roles or progress and builds no HTML from data', () => {
  const src = readFileSync(new URL('../../src/aics/worlds.ts', import.meta.url), 'utf8');
  for (const bad of [/innerHTML/, /fetch\(/, /XMLHttpRequest/, /setItem|removeItem/, /littleGenius/, /role|permission|owner|licen[cs]e|auth|token/i, /Math\.random|Date\./]) {
    assert.ok(!bad.test(src.replace(/^\s*\/\/.*$/gm, '')), String(bad));
  }
});

test('all frameworks stay Draft and Phase 5 changed no pack status', () => {
  for (const f of FRAMEWORKS) assert.equal(f.status, 'draft');
});

test('consolidated integration plan: applied once, the patched library runs and renders the planned tiles; wrong or duplicated source is refused untouched', () => {
  const script = new URL('../../integration/apply-all.mjs', import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), 'w5-'));
  cpSync(new URL('../../src/aics', import.meta.url).pathname, join(dir, 'aics'), { recursive: true });
  writeFileSync(join(dir, 'animalArt.ts'), 'export const fullAnimal = () => "";');
  writeFileSync(join(dir, 'poems.ts'), 'export const poemsView = () => "";');
  const app = join(dir, 'learningApp.ts');
  writeFileSync(app, LEARNING_V48); writeFileSync(join(dir, 'main.ts'), MAIN_V48);
  const original = readFileSync(app, 'utf8');
  assert.match(execFileSync('node', [script, dir, '--check']).toString(), /anchors ok/);
  assert.equal(readFileSync(app, 'utf8'), original, '--check writes nothing');
  assert.match(execFileSync('node', [script, dir]).toString(), /applied 12 edits/);
  const patched = readFileSync(app, 'utf8');
  assert.match(execFileSync('node', [script, dir]).toString(), /already applied/);
  assert.equal(readFileSync(app, 'utf8'), patched);
  assert.equal(patched.split('\n').length, original.split('\n').length + 3, 'import, plan and migration-start lines added');
  // run the patched file with a stored profile and a minimal localStorage
  writeFileSync(app, patched.replace(/from '(\.\/[A-Za-z/]+)'/g, "from '$1.ts'")); // Vite resolves extensionless imports; plain Node does not
  const runner = join(dir, 'run.mts');
  writeFileSync(runner, `
    const store = new Map<string,string>([['${PROFILE_KEY}', ${JSON.stringify(JSON.stringify(profile('PK', 'snc-ecce-2020', 'A4', ['en'])))}], ['lgaAicsPublishedV1', ${JSON.stringify(publishedCacheJson())}]]);
    (globalThis as any).localStorage = { getItem:(k:string)=>store.get(k) ?? null, setItem(){}, removeItem(){} };
    const { library } = await import('./learningApp.ts');
    const html = library();
    const tiles = [...html.matchAll(/lga-tile-(\\d)" data-tab="([a-z]+)"/g)].map(m => m[1] + ':' + m[2]);
    console.log(JSON.stringify({ tiles, urdu: html.includes('data-tab="urdu"'), cats: (html.match(/data-category=/g) || []).length }));
  `);
  const out = JSON.parse(execFileSync('node', [runner]).toString().trim().split('\n').pop()!);
  assert.equal(out.tiles.length, 6);
  assert.ok(out.tiles.some((x: string) => x.endsWith(':urdu')), 'Urdu tile is demoted, never removed');
  assert.ok(out.tiles.some((x: string) => x.endsWith(':shapes')), 'Shape Lab stays on the launcher');
  assert.equal(out.tiles[5], '5:urdu', 'English-only Pakistan profile: Urdu moves last');
  assert.equal(out.cats, 4, 'all four library categories still listed');
  assert.deepEqual(out.tiles.map((x: string) => x[0]), ['0', '1', '2', '3', '4', '5'], 'tile slots keep their visual classes');
  // a directory whose files do not match is refused and left alone
  const other = mkdtempSync(join(tmpdir(), 'w5o-')); writeFileSync(join(other, 'learningApp.ts'), 'export const x = 1;\n'); writeFileSync(join(other, 'main.ts'), 'export const y = 1;\n');
  assert.throws(() => execFileSync('node', [script, other], { stdio: 'pipe' }));
  assert.equal(readFileSync(join(other, 'learningApp.ts'), 'utf8'), 'export const x = 1;\n');
  // an anchor that appears twice is refused too, and neither file is touched
  const dupDir = mkdtempSync(join(tmpdir(), 'w5d-')); writeFileSync(join(dupDir, 'learningApp.ts'), original + "\nimport { fullAnimal } from './animalArt';\n"); writeFileSync(join(dupDir, 'main.ts'), MAIN_V48);
  const dupBefore = readFileSync(join(dupDir, 'learningApp.ts'), 'utf8');
  assert.throws(() => execFileSync('node', [script, dupDir], { stdio: 'pipe' }));
  assert.equal(readFileSync(join(dupDir, 'learningApp.ts'), 'utf8'), dupBefore); assert.equal(readFileSync(join(dupDir, 'main.ts'), 'utf8'), MAIN_V48);
});
