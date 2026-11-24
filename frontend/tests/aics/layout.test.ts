import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === '.git') continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) { out.push(p); walk(p, out); }
  }
  return out;
};

test('single source of truth: exactly one src/aics directory in the package', () => {
  const dirs = walk(root).map((p) => relative(root, p));
  assert.deepEqual(dirs.filter((d) => d.endsWith('/aics') || d === 'aics').filter((d) => d.startsWith('src')), ['src/aics']);
  assert.equal(dirs.filter((d) => /(^|\/)app(\/|$)/.test(d)).length, 0, 'no nested app/ copy');
  assert.equal(dirs.filter((d) => d.endsWith('/aics') && !d.startsWith('src') && !d.startsWith('tests')).length, 0);
});
