import test from 'node:test';
import assert from 'node:assert/strict';
import { alphabetLettersPractised, isAlphabetCourseComplete } from '../../src/abcProgress.ts';

test('ABC course completion requires all 26 letters', () => {
  assert.equal(isAlphabetCourseComplete({ Z: true }), false);
  assert.equal(alphabetLettersPractised({ Z: true }), 1);

  const all = Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => [letter, true])
  );
  assert.equal(alphabetLettersPractised(all), 26);
  assert.equal(isAlphabetCourseComplete(all), true);
});

test('ABC completion ignores extra and false entries', () => {
  const progress: Record<string, unknown> = {
    A: true,
    Z: true,
    C: false,
    1: true
  };
  assert.equal(isAlphabetCourseComplete(progress), false);
  assert.equal(alphabetLettersPractised(progress), 2);
});
