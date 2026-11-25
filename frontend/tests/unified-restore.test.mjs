import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTORE_PROGRESS_KEYS,
  runRestoreWithRecovery
} from '../src/unifiedRestore.ts';

function fakeStorage(initial = {}, failWrite = () => false) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (failWrite(key)) throw new Error('Simulated write failure');
      values.set(key, String(value));
    },
    removeItem(key) {
      if (failWrite(key)) throw new Error('Simulated remove failure');
      values.delete(key);
    }
  };
  return { storage, values };
}

test('seven distinct progress keys are protected', () => {
  assert.equal(RESTORE_PROGRESS_KEYS.length, 7);
  assert.equal(new Set(RESTORE_PROGRESS_KEYS).size, 7);
});

test('successful restore preserves new progress', () => {
  const { storage } = fakeStorage();
  const result = runRestoreWithRecovery(storage, () => {
    for (const key of RESTORE_PROGRESS_KEYS) {
      storage.setItem(key, 'new');
    }
    return true;
  });
  assert.equal(result, 'restored');
  for (const key of RESTORE_PROGRESS_KEYS) {
    assert.equal(storage.getItem(key), 'new');
  }
});

test('failed restore recovers all seven original values', () => {
  const initial = Object.fromEntries(
    RESTORE_PROGRESS_KEYS.map((key, i) => [key, 'old-' + i])
  );
  const { storage } = fakeStorage(initial);
  const result = runRestoreWithRecovery(storage, () => {
    for (const key of RESTORE_PROGRESS_KEYS.slice(0, 4)) {
      storage.setItem(key, 'changed');
    }
    return false;
  });
  assert.equal(result, 'recovered');
  for (const [key, value] of Object.entries(initial)) {
    assert.equal(storage.getItem(key), value);
  }
});

test('thrown error recovers original and absent values', () => {
  const { storage } = fakeStorage({
    littleGeniusProgress: '{"A":true}'
  });
  const result = runRestoreWithRecovery(storage, () => {
    storage.setItem('littleGeniusProgress', '{}');
    storage.setItem('littleGeniusCourseComplete', 'yes');
    throw new Error('Simulated restore failure');
  });
  assert.equal(result, 'recovered');
  assert.equal(storage.getItem('littleGeniusProgress'), '{"A":true}');
  assert.equal(storage.getItem('littleGeniusCourseComplete'), null);
});

test('failed recovery is never reported as success', () => {
  let blockRecovery = false;
  const { storage } = fakeStorage(
    { littleGeniusProgress: 'old' },
    key => blockRecovery && key === 'littleGeniusProgress'
  );
  const result = runRestoreWithRecovery(storage, () => {
    storage.setItem('littleGeniusProgress', 'new');
    blockRecovery = true;
    return false;
  });
  assert.equal(result, 'recovery-failed');
});

test('unreadable storage prevents restore from starting', () => {
  let called = false;
  const storage = {
    getItem() { throw new Error('Unavailable'); },
    setItem() { throw new Error('Unavailable'); },
    removeItem() { throw new Error('Unavailable'); }
  };
  const result = runRestoreWithRecovery(storage, () => {
    called = true;
    return true;
  });
  assert.equal(result, 'unavailable');
  assert.equal(called, false);
});

test('unrelated settings remain unchanged during recovery', () => {
  const { storage } = fakeStorage({
    unrelatedPreference: 'keep',
    littleGeniusProgress: 'old'
  });
  const result = runRestoreWithRecovery(storage, () => {
    storage.setItem('littleGeniusProgress', 'changed');
    throw new Error('Failed');
  });
  assert.equal(result, 'recovered');
  assert.equal(storage.getItem('unrelatedPreference'), 'keep');
});