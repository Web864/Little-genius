import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 10: the consolidated plan run against the TRANSCRIBED v48 text (not a byte-exact download; see fixtures/v48-transcribed/PROVENANCE.md).
const root = resolve(fileURLToPath(import.meta.url), '../../..');
const fx = join(root, 'tests/aics/fixtures/v48-transcribed');
const plan = join(root, 'integration/apply-all.mjs');
const copy = () => { const d = mkdtempSync(join(tmpdir(), 'lga-p10-')); for (const f of ['main.ts', 'learningApp.ts']) copyFileSync(join(fx, f), join(d, f)); return d; };
const run = (d: string, ...a: string[]) => spawnSync('node', [plan, d, ...a], { encoding: 'utf8' });

test('check writes nothing, apply applies all 12 edits, verify passes, re-apply is a no-op', () => {
  const d = copy(); const before = ['main.ts', 'learningApp.ts'].map((f) => readFileSync(join(d, f), 'utf8'));
  const c = run(d, '--check'); assert.equal(c.status, 0, c.stdout + c.stderr); assert.match(c.stdout, /12 edits would be applied/);
  assert.deepEqual(['main.ts', 'learningApp.ts'].map((f) => readFileSync(join(d, f), 'utf8')), before, '--check wrote nothing');
  const a = run(d); assert.equal(a.status, 0, a.stdout + a.stderr); assert.match(a.stdout, /applied 12 edits/);
  const v = run(d, '--verify'); assert.equal(v.status, 0, v.stdout + v.stderr);
  const afterOnce = ['main.ts', 'learningApp.ts'].map((f) => readFileSync(join(d, f), 'utf8'));
  const again = run(d); assert.equal(again.status, 0); assert.match(again.stdout, /already applied/);
  assert.deepEqual(['main.ts', 'learningApp.ts'].map((f) => readFileSync(join(d, f), 'utf8')), afterOnce, 'second run changed nothing');
  rmSync(d, { recursive: true, force: true });
});

test('verify fails on the untouched original (the plan is not silently assumed)', () => {
  const d = copy(); const v = run(d, '--verify'); assert.notEqual(v.status, 0); rmSync(d, { recursive: true, force: true });
});

test('what the plan must NOT change is preserved: licence/demo/owner/sign-out text, library groups incl. Urdu Garden, launch tiles, reset text', () => {
  const d = copy(); run(d);
  const main = readFileSync(join(d, 'main.ts'), 'utf8'); const la = readFileSync(join(d, 'learningApp.ts'), 'utf8');
  for (const keep of ["api.get('/api/license/status')", "api.post('/api/license/demo'", "api.post('/api/license/activate'", "'15-minute demo'", 'await auth.signOut();location.reload();', "if(access?.status==='licensed')void setupSchoolProfile();", "if(access?.status==='owner')attachOwnerButton();", "access?.status==='demo'", 'clearTimeout(timer);timer=setTimeout(()=>void check()'])
    assert.ok(main.includes(keep), 'main.ts keeps: ' + keep);
  for (const keep of ['["urdu","Urdu Garden",[["urdu","🌷","Urdu Letters","Identify and practise Urdu letters"]]]', '"Memory Mission"', 'lga-tile-${i}', 'Reset all saved alphabet practice progress on this device?', "localStorage.removeItem('littleGeniusCourseComplete')", 'export function mountLearningApp(){ curriculumReset();'])
    assert.ok(la.includes(keep), 'learningApp.ts keeps: ' + keep);
  rmSync(d, { recursive: true, force: true });
});

test('a drifted anchor (live app changed) makes the plan refuse and write nothing', () => {
  const d = copy(); const p = join(d, 'main.ts'); const s = readFileSync(p, 'utf8'); writeFileSync(p, s.replace("import { confirmInApp } from './grownUp';", "import { confirmInApp as c } from './grownUp';"));
  const before = readFileSync(join(d, 'learningApp.ts'), 'utf8'); const r = run(d); assert.notEqual(r.status, 0);
  assert.equal(readFileSync(join(d, 'learningApp.ts'), 'utf8'), before, 'the other file was not touched either'); rmSync(d, { recursive: true, force: true });
});

test('fixture is labelled as a transcription, not an exact copy', () => {
  assert.match(readFileSync(join(fx, 'PROVENANCE.md'), 'utf8'), /NOT a byte-exact download/);
});
