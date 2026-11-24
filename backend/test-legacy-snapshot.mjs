import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegacyGameSnapshot } from './src/localAuth.js';
const valid = () => ({ lost: { current: 3, completed: ['A','B'] },
 picture: { last: 'A', letters: { A: { success: 2, wrong: 1 } } },
 quests: { completed: ['forest'] } });
test('valid legacy original games snapshot accepts only allow-listed values', () => {
 const r = validateLegacyGameSnapshot(valid()); assert.equal(r.valid, true);
});
test('rejects extra private data and unexpected game keys', () => {
 const x = valid(); x.email = 'child@example.invalid';
 assert.equal(validateLegacyGameSnapshot(x).valid, false);
});
test('rejects malformed attempt counters and invalid letters', () => {
 const x = valid(); x.picture.letters.A.wrong = -1; assert.equal(validateLegacyGameSnapshot(x).valid, false);
 const y = valid(); y.lost.completed = ['A','A']; assert.equal(validateLegacyGameSnapshot(y).valid, false);
});
test('rejects unknown story keys', () => {
 const x = valid(); x.quests.completed = ['owner']; assert.equal(validateLegacyGameSnapshot(x).valid, false);
});
