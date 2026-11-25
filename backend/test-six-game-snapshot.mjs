import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSixGameSnapshot } from './src/sixGameSnapshot.js';

function sample() {
  return {
    version: 1,
    math: {
      numbers: [1, 2, 10],
      addition: [1, 7]
    },
    curriculum: {
      records: {
        'phonics:0': {
          ok: 2,
          wrong: 1,
          tries: 3,
          due: '2026-11-25'
        },
        'urdu:37': {
          ok: 1,
          wrong: 0,
          tries: 1,
          due: '2026-11-25'
        }
      }
    }
  };
}

test('accepts a valid six-game snapshot', () => {
  const result = validateSixGameSnapshot(sample());

  assert.equal(result.valid, true);
  assert.equal(result.snapshot.math.numbers.length, 3);
});

test('rejects duplicate completed levels', () => {
  const snapshot = sample();
  snapshot.math.numbers = [1, 1];

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('rejects out-of-range game levels', () => {
  const snapshot = sample();
  snapshot.math.addition = [8];

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('rejects unknown curriculum worlds', () => {
  const snapshot = sample();
  snapshot.curriculum.records['unknown:0'] = {
    ok: 1, wrong: 0, tries: 1, due: '2026-11-25'
  };

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('rejects out-of-range curriculum indexes', () => {
  const snapshot = sample();
  snapshot.curriculum.records['phonics:10'] = {
    ok: 1, wrong: 0, tries: 1, due: '2026-11-25'
  };

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('accepts Urdu lesson index 38 and rejects index 39', () => {
  const snapshot = sample();
  snapshot.curriculum.records['urdu:38'] = {
    ok: 1, wrong: 0, tries: 1, due: '2026-11-25'
  };
  assert.equal(validateSixGameSnapshot(snapshot).valid, true);

  snapshot.curriculum.records['urdu:39'] = {
    ok: 1, wrong: 0, tries: 1, due: '2026-11-25'
  };
  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('rejects extra personal information', () => {
  const snapshot = sample();
  snapshot.childName = 'Example';

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('rejects negative counters', () => {
  const snapshot = sample();
  snapshot.curriculum.records['phonics:0'].wrong = -1;

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('rejects invalid calendar dates', () => {
  const snapshot = sample();
  snapshot.curriculum.records['phonics:0'].due = '2026-02-30';

  assert.equal(validateSixGameSnapshot(snapshot).valid, false);
});

test('accepts empty new-account progress', () => {
  const snapshot = {
    version: 1,
    math: { numbers: [], addition: [] },
    curriculum: { records: {} }
  };

  assert.equal(validateSixGameSnapshot(snapshot).valid, true);
});
