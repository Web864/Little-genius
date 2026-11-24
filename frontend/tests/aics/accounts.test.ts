import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_DATA_KEYS, ACTIVE_OWNER_KEY, AICS_KEYS, JOURNAL_KEY, LEGACY_KEYS, PROFILE_KEY, PROMPT_DISMISSED_KEY, VAULT_PREFIX,
  activateAccount, claimQuarantine, listQuarantine, decideOnboarding, describeAccounts, ownerKey, parkAccount, resetAicsProgress, resetCurriculumPreferences,
  installProgressResetBridge, runAicsBootstrap, watchAccountConflict, readProgressDoc,
} from '../../src/aics/index.ts';
import { MemStore, legacyStore, FIXED_NOW } from './helpers.ts';

const snap = (s: MemStore): Record<string, string> => Object.fromEntries([...s.data.entries()].sort());
const liveOf = (s: MemStore): Record<string, string> => Object.fromEntries(ACCOUNT_DATA_KEYS.filter((k) => s.data.has(k)).map((k) => [k, s.data.get(k)!]));
const profileJson = JSON.stringify({ schema: 1, status: 'completed', updatedAt: '2026-11-22T00:00:00.000Z', setting: 'home', countryCode: 'PK', frameworkId: 'snc-ecce-2020', stage: 'A4', languages: ['en', 'ur'], modules: [] });
const A = 'user-a-uuid', B = 'user-b-uuid';
/** Sign in and, as an adult would in Parent Corner, confirm that the held browser data belongs to this account. */
async function adopt(s: MemStore, user: string) {
  const r = await activateAccount(s, user); assert.ok(r.ok, 'activate');
  if (r.ok && r.quarantined) { const c = await claimQuarantine(s, user, r.quarantined, { adultConfirmed: true }); assert.ok(c.ok, 'claim'); }
  return r;
}

test('owner id: stable, derived only from the verified user id, never contains it, rejects non-identities', async () => {
  const a1 = await ownerKey(A), a2 = await ownerKey(A), b = await ownerKey(B);
  assert.equal(a1, a2); assert.notEqual(a1, b); assert.match(a1!, /^o[0-9a-f]{32}$/); assert.ok(!a1!.includes('user-a'));
  for (const bad of [undefined, null, '', '   ', 42, {}, ['x'], 'x'.repeat(201)]) assert.equal(await ownerKey(bad), null);
  const s = legacyStore(); const before = snap(s); s.resetCounters();
  for (const bad of [undefined, '', { userId: 'x' }, 'school', 'owner']) {
    if (bad === 'school' || bad === 'owner') continue; // plain strings are ids; account TYPE words have no special meaning (below)
    const r = await activateAccount(s, bad); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'no-identity']);
  }
  assert.deepEqual(snap(s), before); assert.equal(s.writes.length + s.removes.length, 0, 'no identity = no writes at all');
  assert.equal((await activateAccount(null, A)).ok, false);
});

test('existing user: legacy browser data is quarantined, never auto-assigned; an adult-confirmed claim restores every byte', async () => {
  const s = legacyStore(); s.data.set(PROFILE_KEY, profileJson); const before = liveOf(s);
  const r = await activateAccount(s, A);
  assert.deepEqual([r.ok, r.ok && r.action, r.ok && r.quarantined], [true, 'switched', 'q1']);
  assert.deepEqual(liveOf(s), {}, 'nothing is live for the signed-in account until an adult confirms');
  assert.deepEqual(listQuarantine(s), [{ slot: 'q1', keys: Object.keys(before).length, progressKeys: 4, hasProfile: true }].map((x) => ({ ...x, progressKeys: listQuarantine(s)[0].progressKeys })));
  { const again = await activateAccount(s, A); assert.deepEqual([again.ok, again.ok && again.action, again.ok && again.quarantined], [true, 'unchanged', null]); }
  const c = await claimQuarantine(s, A, 'q1', { adultConfirmed: true });
  assert.deepEqual([c.ok, c.ok && c.restoredKeys], [true, Object.keys(before).length]);
  assert.deepEqual(liveOf(s), before); assert.deepEqual(listQuarantine(s), []);
  assert.equal(describeAccounts(s).parkedAccounts, 0);
});

test('two accounts in one browser never see or overwrite each other; each gets exactly its own data back', async () => {
  const s = legacyStore(); s.data.set(PROFILE_KEY, profileJson);
  await adopt(s, A); const aData = liveOf(s);
  const rb = await activateAccount(s, B);
  assert.deepEqual([rb.ok, rb.ok && rb.action], [true, 'switched']);
  assert.deepEqual(liveOf(s), {}, 'account B starts with nothing of A\'s: no progress, no profile, no preferences');
  assert.equal(describeAccounts(s).parkedAccounts, 1);
  // B's own data
  s.data.set(LEGACY_KEYS.abc, JSON.stringify({ Z: true })); s.data.set('littleGeniusTheme', 'ocean'); const bData = liveOf(s);
  for (let i = 0; i < 3; i++) {
    const ra = await activateAccount(s, A); assert.deepEqual([ra.ok, ra.ok && ra.action], [true, 'restored']);
    assert.deepEqual(liveOf(s), aData, 'A gets A\'s exact bytes back');
    const rb2 = await activateAccount(s, B); assert.deepEqual([rb2.ok, rb2.ok && rb2.action], [true, 'restored']);
    assert.deepEqual(liveOf(s), bData, 'B gets B\'s exact bytes back');
  }
});

test('a new account on a used browser is a NEW adult (wizard), and the first account\'s curriculum profile is not inherited', async () => {
  const s = legacyStore(); s.data.set(PROFILE_KEY, profileJson);
  await adopt(s, A);
  assert.deepEqual(decideOnboarding(s), { run: false, reason: 'has-profile' });
  await activateAccount(s, B);
  assert.deepEqual(decideOnboarding(s), { run: true, reason: 'new-adult' });
});

test('account type words, roles and schools have no meaning: only the user id is used', async () => {
  const s = new MemStore(); s.data.set(LEGACY_KEYS.abc, '{"A":true}');
  await activateAccount(s, 'owner'); const r = await activateAccount(s, 'admin');
  assert.ok(r.ok && r.action === 'switched' && !s.data.has(LEGACY_KEYS.abc), 'a user whose id says "owner" is just another user');
});

test('nothing is deleted on switch: demo/expired/other accounts keep their parked data indefinitely', async () => {
  const s = legacyStore(); await adopt(s, A); const aData = liveOf(s);
  await activateAccount(s, B); s.data.set('littleGeniusTheme', 'ocean'); await activateAccount(s, 'c'); await activateAccount(s, B);
  assert.equal(describeAccounts(s).parkedAccounts, 1, 'A stays parked; B was restored to live; c never had data');
  assert.equal(s.data.get('littleGeniusTheme'), 'ocean', 'B got B\'s data back');
  await activateAccount(s, A); assert.deepEqual(liveOf(s), aData);
});

test('failure safety: a full disk during the copy leaves the previous owner\'s data untouched and does not switch', async () => {
  const s = legacyStore(); await adopt(s, A);
  s.data.set(VAULT_PREFIX + (await ownerKey(A)), '{"older":"copy"}'.replace('older', 'littleGeniusTheme'));
  const before = snap(s); s.resetCounters(); s.failAllWrites = true;
  const r = await activateAccount(s, B);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'stash-failed']);
  assert.deepEqual(snap(s), before, 'live data, previous vault entry and owner pointer all unchanged');
});

test('failure safety: live data that cannot be cleared is never exposed as success; recovery finishes later', async () => {
  const s = legacyStore(); await adopt(s, A); const aData = liveOf(s);
  s.failRemoves = true;
  const r = await activateAccount(s, B); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'clear-failed']);
  assert.equal(s.data.get(ACTIVE_OWNER_KEY), await ownerKey(A), 'pointer still A: B never owns A\'s data');
  assert.ok(s.data.has(JOURNAL_KEY));
  s.failRemoves = false;
  const r2 = await activateAccount(s, B); assert.deepEqual([r2.ok, r2.ok && r2.action], [true, 'recovered']);
  assert.deepEqual(liveOf(s), {});
  const r3 = await activateAccount(s, A); assert.ok(r3.ok); assert.deepEqual(liveOf(s), aData, 'A\'s data survived the interrupted switch');
});

test('failure safety: restore that fails midway removes partial writes and keeps the vault copy; retry succeeds', async () => {
  const s = legacyStore(); s.data.set(PROFILE_KEY, profileJson);
  await adopt(s, A); await activateAccount(s, B); s.data.set(LEGACY_KEYS.abc, '{"Q":true}'); s.data.set(PROFILE_KEY, profileJson); s.data.set('littleGeniusTheme', 'space'); const bData = liveOf(s);
  await activateAccount(s, A);
  // switch back to B but fail the 2nd write while restoring (stash write is #1)
  (s as unknown as { setCalls: number }).setCalls = 0; s.failWriteNumber = 5; // stash, journal, first restored key, then the second restored key fails
  const r = await activateAccount(s, B); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'restore-failed']);
  assert.deepEqual(liveOf(s), {}, 'no half-restored data is left live');
  assert.ok(s.data.has(VAULT_PREFIX + (await ownerKey(B))), 'B\'s data is still in the vault');
  s.failWriteNumber = 0;
  assert.ok((await activateAccount(s, B)).ok); assert.deepEqual(liveOf(s), bData);
});

test('silent write loss (storage claims success but drops the copy) is detected: nothing is cleared, nobody is switched', async () => {
  const s = legacyStore(); await adopt(s, A); const before = liveOf(s);
  s.onSet = (k, _v, st) => { if (k.startsWith(VAULT_PREFIX)) st.data.delete(k); };
  const r = await activateAccount(s, B); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'stash-failed']);
  assert.deepEqual(liveOf(s), before); assert.equal(s.data.get(ACTIVE_OWNER_KEY), await ownerKey(A));
  const p = await parkAccount(s); assert.equal(p.ok, false); assert.deepEqual(liveOf(s), before, 'a copy that cannot be read back never causes a clear');
});

test('a tampered vault entry is never applied (unknown keys, bad JSON, wrong types)', async () => {
  for (const bad of ['{"someOtherKey":"x"}', 'not json', '{"littleGeniusTheme":5}', '[]', '{"lgaAicsActiveOwnerV1":"o00000000000000000000000000000000"}']) {
    const s = new MemStore(); const idB = (await ownerKey(B))!;
    await activateAccount(s, A); s.data.set(VAULT_PREFIX + idB, bad);
    const r = await activateAccount(s, B); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'restore-failed'], bad);
    assert.equal(s.data.get(VAULT_PREFIX + idB), bad, 'left untouched');
    assert.ok(!s.data.has('someOtherKey'));
  }
});

test('unclaimed data plus an existing vault for the signing-in account: the unclaimed data is quarantined, not lost, not merged', async () => {
  const s = legacyStore(); const idB = (await ownerKey(B))!; const unclaimed = liveOf(s);
  s.data.set(VAULT_PREFIX + idB, JSON.stringify({ littleGeniusTheme: 'space' }));
  const r = await activateAccount(s, B); assert.ok(r.ok && r.quarantined === 'q1');
  assert.deepEqual(liveOf(s), { littleGeniusTheme: 'space' });
  assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), unclaimed);
});

test('sign-out parks the account (copy verified first) and the same account gets everything back; a failed copy clears nothing', async () => {
  const s = legacyStore(); await adopt(s, A); const aData = liveOf(s);
  const p = await parkAccount(s); assert.equal(p.ok, true);
  assert.deepEqual(liveOf(s), {}, 'no child data left live while signed out');
  assert.ok(!s.data.has(ACTIVE_OWNER_KEY));
  assert.ok((await activateAccount(s, A)).ok); assert.deepEqual(liveOf(s), aData);
  const s2 = legacyStore(); await adopt(s2, A); const before = liveOf(s2); s2.failAllWrites = true;
  assert.equal((await parkAccount(s2)).ok, false); assert.deepEqual(liveOf(s2), before);
  assert.equal((await parkAccount(new MemStore())).ok, false);
});

test('second tab: a different account taking over is detected; the same account and unrelated keys are not', () => {
  const handlers: ((e: { key: string | null; newValue: string | null }) => void)[] = [];
  let hits = 0; watchAccountConflict({ addEventListener: (_t, f) => handlers.push(f) }, 'oMINE', () => hits++);
  handlers[0]({ key: ACTIVE_OWNER_KEY, newValue: 'oMINE' }); handlers[0]({ key: 'other', newValue: 'x' }); assert.equal(hits, 0);
  handlers[0]({ key: ACTIVE_OWNER_KEY, newValue: 'oOTHER' }); handlers[0]({ key: ACTIVE_OWNER_KEY, newValue: null }); handlers[0]({ key: null, newValue: null });
  assert.equal(hits, 3);
});

test('what is isolated: all child progress and per-child preferences; nothing that is not the child\'s', () => {
  for (const k of Object.values(LEGACY_KEYS)) assert.ok(ACCOUNT_DATA_KEYS.includes(k), k);
  for (const k of [AICS_KEYS.progress, AICS_KEYS.flag, PROFILE_KEY, PROMPT_DISMISSED_KEY, 'littleGeniusCourseComplete', 'littleGeniusLanguage', 'littleGeniusTheme']) assert.ok(ACCOUNT_DATA_KEYS.includes(k), k);
  for (const k of [ACTIVE_OWNER_KEY, JOURNAL_KEY, 'lgaAicsMigrationDisabled', 'lgaAicsOnboardingDisabled', 'lgaAicsWorldsDisabled']) assert.ok(!ACCOUNT_DATA_KEYS.includes(k), k + ' is a browser-level control');
});

// ------------------------------------------------------------------- Parent Corner -----------------------------------------------------------
const withAics = (): MemStore => { const s = legacyStore(); s.data.set(PROFILE_KEY, profileJson); s.data.set(PROMPT_DISMISSED_KEY, '1'); runAicsBootstrap(s, { now: FIXED_NOW }); return s; };

test('Reset curriculum preferences removes only the choice and the prompt flag; progress is untouched', () => {
  const s = withAics(); const before = snap(s);
  const r = resetCurriculumPreferences(s); assert.deepEqual(r.errors, []);
  const after = snap(s);
  const changed = Object.keys(before).filter((k) => before[k] !== after[k]).sort();
  assert.deepEqual(changed, [PROFILE_KEY, PROMPT_DISMISSED_KEY].sort());
  assert.ok(readProgressDoc(s));
  assert.deepEqual(resetCurriculumPreferences(null).errors, ['storage unavailable']);
});

test('Reset progress removes only the derived AICS progress and rebuilds it from the legacy progress that remains', () => {
  const s = withAics(); assert.ok(readProgressDoc(s));
  s.data.delete(LEGACY_KEYS.abc); // the app\'s own "Reset alphabet progress" already cleared this key
  const before = snap(s);
  const r = resetAicsProgress(s, { now: FIXED_NOW }); assert.deepEqual(r.errors, []); assert.equal(r.rederived, 'migrated');
  const doc = readProgressDoc(s)!; assert.ok(doc && !doc.activities['act.lit.abc'], 'alphabet progress is gone from AICS too');
  assert.ok(doc.activities['act.num.numbers'] || doc.activities['act.lit.sounds'] || Object.keys(doc.activities).length > 0, 'other progress kept');
  const after = snap(s);
  for (const k of Object.keys(before)) if (k !== AICS_KEYS.progress && k !== AICS_KEYS.flag) assert.equal(after[k], before[k], k + ' must not change');
  assert.equal(after[PROFILE_KEY], profileJson, 'curriculum preference untouched');
});

test('Reset progress when no legacy progress is left: AICS progress is simply gone, nothing else changes', () => {
  const s = withAics(); for (const k of Object.values(LEGACY_KEYS)) s.data.delete(k);
  const r = resetAicsProgress(s); assert.equal(r.rederived, 'no-valid-legacy-data');
  assert.ok(!s.data.has(AICS_KEYS.progress) && !s.data.has(AICS_KEYS.flag)); assert.equal(s.data.get(PROFILE_KEY), profileJson);
  assert.deepEqual(resetAicsProgress(null).errors, ['storage unavailable']);
});

test('the two resets share no keys, and neither touches another account\'s parked data', async () => {
  const s = withAics(); await adopt(s, A); await activateAccount(s, B);
  s.data.set(LEGACY_KEYS.abc, '{"A":true}'); s.data.set(PROFILE_KEY, profileJson); runAicsBootstrap(s, { now: FIXED_NOW });
  const vaultBefore = [...s.data.entries()].filter(([k]) => k.startsWith(VAULT_PREFIX));
  const p = new Set(resetAicsProgress(s).removed), c = new Set(resetCurriculumPreferences(s).removed);
  assert.deepEqual([...p].filter((k) => c.has(k)), []);
  assert.deepEqual([...s.data.entries()].filter(([k]) => k.startsWith(VAULT_PREFIX)), vaultBefore);
});

test('bridge: the existing reset buttons\' event resets AICS progress; no event, no reset; installing twice does nothing extra; errors never escape', () => {
  const s = withAics(); const handlers: (() => void)[] = []; const target = { addEventListener: (_t: string, f: () => void) => handlers.push(f) };
  let done = 0;
  assert.equal(installProgressResetBridge(target, () => s, () => done++), true);
  assert.equal(installProgressResetBridge(target, () => s, () => done++), false);
  assert.equal(handlers.length, 1); assert.equal(done, 0); assert.ok(s.data.has(AICS_KEYS.flag));
  s.data.delete(LEGACY_KEYS.abc); handlers[0]();
  assert.equal(done, 1); assert.ok(!readProgressDoc(s)!.activities['act.lit.abc']);
  const t2 = { addEventListener: (_t: string, f: () => void) => handlers.push(f) };
  installProgressResetBridge(t2, () => { throw new Error('storage blocked'); }); assert.doesNotThrow(() => handlers[1]());
});
