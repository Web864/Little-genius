import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { EDITS, analyze } from '../../integration/apply-all.mjs';
import { LEARNING_V48, MAIN_V48 } from './fixtures/v48-anchors.ts';

// Phase 9: the consolidated, conflict-checked integration plan. These run on SYNTHETIC copies that contain the exact v48 anchor text.
// They prove the script's rules. They do NOT prove a full-app build: no `vite build` was run (no network here).
const script = join(import.meta.dirname, '..', '..', 'integration', 'apply-all.mjs');
const run = (...a: string[]) => execFileSync('node', [script, ...a], { stdio: 'pipe' }).toString();
const dirWith = (l = LEARNING_V48, m = MAIN_V48) => { const d = mkdtempSync(join(tmpdir(), 'p9-')); writeFileSync(join(d, 'learningApp.ts'), l); writeFileSync(join(d, 'main.ts'), m); return d; };
const rd = (d: string) => ({ l: readFileSync(join(d, 'learningApp.ts'), 'utf8'), m: readFileSync(join(d, 'main.ts'), 'utf8') });

test('the plan covers Phases 2, 3, 5, 7, 8 and 9 with 12 edits; every anchor occurs exactly once in the (v48-shaped) originals', () => {
  assert.equal(EDITS.length, 12); assert.equal(new Set(EDITS.map((e) => e.id)).size, 12);
  assert.deepEqual([...new Set(EDITS.flatMap((e) => e.phases))].sort(), [2, 3, 5, 7, 8, 9]);
  for (const e of EDITS) { const t = e.file === 'main' ? MAIN_V48 : LEARNING_V48; assert.equal(t.split(e.from).length - 1, 1, e.id); assert.equal(t.split(e.to).length - 1, 0, e.id + ' not already applied'); }
  assert.match(run('--list'), /M4\tphase 7\+8\+9/);
});

test('--check writes nothing; apply writes both files; a second run is a no-op; --verify agrees', () => {
  const d = dirWith(); const before = rd(d);
  assert.match(run(d, '--check'), /12 edits would be applied/); assert.deepEqual(rd(d), before);
  assert.throws(() => run(d, '--verify'), /./);
  assert.match(run(d), /applied 12 edits across 2 files/); const after = rd(d); assert.notEqual(after.m, before.m); assert.notEqual(after.l, before.l);
  assert.match(run(d), /already applied/); assert.deepEqual(rd(d), after); assert.match(run(d, '--verify'), /verified/);
});

test('deterministic: same input gives byte-identical output every time, and the order of the edit list does not matter', () => {
  const a = dirWith(); const b = dirWith(); run(a); run(b); assert.deepEqual(rd(a), rd(b));
  const files = { main: MAIN_V48, learning: LEARNING_V48 };
  const fwd = analyze(files, EDITS); const rev = analyze(files, [...EDITS].reverse()); const shuffled = analyze(files, [EDITS[5], EDITS[11], EDITS[0], EDITS[8], EDITS[2], EDITS[10], EDITS[1], EDITS[7], EDITS[3], EDITS[9], EDITS[4], EDITS[6]]);
  assert.equal(fwd.state, 'fresh'); assert.deepEqual(rev.out, fwd.out); assert.deepEqual(shuffled.out, fwd.out);
});

test('conflict check: overlapping anchors, a missing anchor, a duplicated anchor and a half-applied file are each refused and NOTHING is written to either file', () => {
  const overlap = [...EDITS, { id: 'X', phases: [9], file: 'main' as const, what: 'overlaps M4', from: "void setupSchoolProfile();\n if(access?.status==='owner')", to: 'ZZ-OVERLAP-ZZ' }];
  const o = analyze({ main: MAIN_V48, learning: LEARNING_V48 }, overlap as never); assert.equal(o.state, 'error'); assert.match(o.problems.join(), /overlap/);
  const missing = dirWith(LEARNING_V48, MAIN_V48.replace("if(target.closest('#licence-out')){await auth.signOut();location.reload();}", 'if(false){}'));
  const mb = rd(missing); assert.throws(() => run(missing), /./); assert.deepEqual(rd(missing), mb, 'main.ts problem: learningApp.ts untouched too');
  const dup = dirWith(LEARNING_V48 + "\nimport { fullAnimal } from './animalArt';\n"); const db = rd(dup); assert.throws(() => run(dup), /./); assert.deepEqual(rd(dup), db);
  const d = dirWith(); run(d); const half = rd(d); const e = EDITS.find((x) => x.id === 'L6')!;
  writeFileSync(join(d, 'learningApp.ts'), half.l.replace(e.to, e.from)); const hb = rd(d);
  const err = (() => { try { run(d); return ''; } catch (x) { return String((x as { stderr: Buffer }).stderr); } })(); assert.match(err, /partial state/); assert.deepEqual(rd(d), hb);
  assert.throws(() => run(mkdtempSync(join(tmpdir(), 'p9e-'))), /./); assert.throws(() => execFileSync('node', [script], { stdio: 'pipe' }));
});

test('the patched files are valid TypeScript and carry each hook exactly once, in a safe order', () => {
  const d = dirWith(); run(d); const { l, m } = rd(d);
  for (const base of ['file:///opt/node22/lib/node_modules/', 'file:///opt/npm-tools/node_modules/']) {
    try { const es = createRequire(base)('esbuild'); es.transformSync(m, { loader: 'ts' }); es.transformSync(l, { loader: 'ts' }); break; } catch (e) { if (!/Cannot find/.test(String(e))) throw e; }
  }
  const once = (t: string, s: string) => assert.equal(t.split(s).length - 1, 1, s);
  for (const s of ['installProgressResetBridge', 'syncSchoolDefaults', 'startPublishedResync', 'installOwnerManager', 'installSchoolSettings', 'signOutSafely', 'activateAccount', 'maybeRunOnboarding', 'installOwnership']) once(m, s);
  once(l, "import('./aics/bootstrap')"); once(l, 'aicsWorlds(baseGroups)'); once(l, 'lga-parent-progress-changed');
  assert.ok(!m.includes('syncPublished('), 'the single-shot sync was replaced by the re-sync');
  const at = (s: string) => m.indexOf(s);
  assert.ok(at('syncSchoolDefaults') < at('startPublishedResync') && at('startPublishedResync') < at('installOwnerManager') && at('installOwnerManager') < at('installSchoolSettings') && at('installSchoolSettings') < at('void setupSchoolProfile()'));
  assert.match(m, /installSchoolSettings\(\{api,isLicensed:\(\)=>access\?\.status==='licensed',confirm:confirmInApp,storage:localStorage\}\)/);
  assert.match(m, /installOwnerManager\(\{api,isOwner:\(\)=>access\?\.status==='owner',confirm:confirmInApp\}\)/);
});

test('every hook calls a module and export that exists in src/aics (no dangling imports)', () => {
  const src = join(import.meta.dirname, '..', '..', 'src', 'aics'); const d = dirWith(); run(d); const { l, m } = rd(d);
  const refs: [string, string][] = [];
  for (const text of [l, m]) for (const x of text.matchAll(/import\('\.\/aics\/([A-Za-z]+)'\)\)?(?:\.then\((?:async )?(\w+)=>)?/g)) refs.push([x[1], x[2] ?? '']);
  assert.ok(refs.length >= 9);
  for (const [mod] of refs) assert.ok(existsSync(join(src, mod + '.ts')), mod);
  const exported = (mod: string, fn: string) => new RegExp('export (?:async )?(?:function|const) ' + fn + '\\b').test(readFileSync(join(src, mod + '.ts'), 'utf8'));
  const calls: [string, string][] = [['bootstrap', 'scheduleAicsBootstrap'], ['onboarding', 'maybeRunOnboarding'], ['accountScope', 'activateAccount'], ['accountScope', 'watchAccountConflict'], ['accountScope', 'signOutSafely'], ['ownership', 'installOwnership'], ['parentControls', 'installProgressResetBridge'], ['schoolConfig', 'syncSchoolDefaults'], ['publishedGate', 'startPublishedResync'], ['curriculumManager', 'installOwnerManager'], ['schoolSettings', 'installSchoolSettings'], ['worlds', 'aicsWorlds']];
  for (const [mod, fn] of calls) { assert.ok(exported(mod, fn), mod + '.' + fn); assert.ok((l + m).includes(fn), 'hook uses ' + fn); }
});

test('account safety is intact under the consolidated plan: isolation precedes onboarding precedes mount; failure stops the mount; sign-out parks first and asks before forcing', () => {
  const d = dirWith(); run(d); const { m } = rd(d); const at = (s: string) => m.indexOf(s);
  assert.ok(at('activateAccount') < at('maybeRunOnboarding') && at('maybeRunOnboarding') < at('mountLearningApp()'), 'isolate -> onboarding -> mount');
  assert.ok(at("if(!iso.ok){") < at('maybeRunOnboarding') && /if\(!iso\.ok\)\{[^}]*return;\}/.test(m), 'isolation failure returns before onboarding and mount');
  assert.ok(at('installOwnership') > at('activateAccount') && /if\(r\.ok\)void import\('\.\/aics\/ownership'\)/.test(m), 'the ownership card installs only after a verified activation');
  assert.ok(at('signOutSafely') < at('await auth.signOut()'), 'park before sign-out');
  assert.match(m, /if\(!so\.proceed&&!\(await confirmInApp\([^)]*Sign out anyway\?[^)]*\)\)\)return;await auth\.signOut\(\)/, 'a failed park asks first; Cancel keeps the user signed in');
  assert.ok(!/ownership'\)[^;]*claimQuarantine/.test(m), 'the app never claims quarantined progress itself; only the adult-confirmed card can');
  assert.match(m, /\['owner','licensed','demo'\]\.includes\(access\?\.status\|\|''\)/, 'only licensed, demo or owner accounts mount (the existing access rules are unchanged)');
});

test('the plan touches nothing else: the original text outside the anchors is preserved byte for byte', () => {
  const d = dirWith(); run(d); const { l, m } = rd(d);
  for (const [orig, out, file] of [[MAIN_V48, m, 'main'], [LEARNING_V48, l, 'learning']] as const) {
    let rest = out; for (const e of EDITS.filter((x) => x.file === file)) rest = rest.replace(e.to, e.from);
    assert.equal(rest, orig, file + ' returns to the original when every edit is reversed');
  }
});
