import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_DATA_KEYS, ACTIVE_OWNER_KEY, JOURNAL_KEY, LEGACY_KEYS, PROFILE_KEY, VAULT_PREFIX, SIGNOUT_FAILED_KEY, PROGRESS_KEYS,
  activateAccount, claimQuarantine, listQuarantine, hasQuarantine, ownerKey, parkAccount, signOutSafely,
} from '../../src/aics/index.ts';
import { MemStore, legacyStore } from './helpers.ts';

const A = 'user-a', B = 'user-b', C = 'user-c';
const liveOf = (s: MemStore): Record<string, string> => Object.fromEntries(ACCOUNT_DATA_KEYS.filter((k) => s.data.has(k)).map((k) => [k, s.data.get(k)!]));
const progressLive = (s: MemStore): string[] => PROGRESS_KEYS.filter((k) => s.data.has(k));
const claimed = async (s: MemStore, u: string): Promise<void> => { const r = await activateAccount(s, u); assert.ok(r.ok); if (r.ok && r.quarantined) assert.ok((await claimQuarantine(s, u, r.quarantined, { adultConfirmed: true })).ok); };

/** Fails the Nth mutating call (set or remove), once; everything else works. */
class FaultStore extends MemStore {
  ops = 0; failAt = 0; failMode: 'throw' | 'drop' = 'throw'; failPrefix = '';
  override setItem(k: string, v: string): void {
    if (this.failPrefix && k.startsWith(this.failPrefix)) throw new Error('QuotaExceededError');
    this.ops++;
    if (this.ops === this.failAt) { if (this.failMode === 'throw') throw new Error('QuotaExceededError'); return; }
    super.setItem(k, v);
  }
  override removeItem(k: string): void { this.ops++; if (this.ops === this.failAt) { if (this.failMode === 'throw') throw new Error('blocked'); return; } super.removeItem(k); }
}
const everything = (s: MemStore): string => JSON.stringify([...s.data.entries()].sort());

test('legacy data is never auto-assigned: any account that signs in first gets nothing, the data is held and byte-identical', async () => {
  for (const first of [A, B, 'owner', 'school-admin']) {
    const s = legacyStore(); const before = liveOf(s);
    const r = await activateAccount(s, first); assert.ok(r.ok && r.quarantined === 'q1');
    assert.deepEqual(liveOf(s), {}, 'no progress visible to ' + first);
    assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), before);
    assert.ok(hasQuarantine(s));
  }
});

test('a second and third account never see held data; the held data is not duplicated or lost', async () => {
  const s = legacyStore(); const before = liveOf(s);
  await activateAccount(s, A); await activateAccount(s, B); await activateAccount(s, C);
  assert.deepEqual(liveOf(s), {}); assert.equal(listQuarantine(s).length, 1);
  assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), before);
});

test('claim: needs the confirmation flag, the active verified account, a real slot and no existing progress', async () => {
  const s = legacyStore(); await activateAccount(s, A);
  for (const bad of [undefined, {}, { adultConfirmed: false }, { adultConfirmed: 'yes' }, { adultConfirmed: 1 }] as unknown[]) {
    const r = await claimQuarantine(s, A, 'q1', bad as { adultConfirmed: boolean }); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'not-confirmed']);
  }
  assert.equal((await claimQuarantine(s, '', 'q1', { adultConfirmed: true })).ok, false);
  const wrong = await claimQuarantine(s, B, 'q1', { adultConfirmed: true }); assert.deepEqual([wrong.ok, !wrong.ok && wrong.reason], [false, 'not-active']);
  for (const slot of ['q0', 'q21', 'q', 'o' + '0'.repeat(32), '../x', 'q1 ', 'q2']) { const r = await claimQuarantine(s, A, slot, { adultConfirmed: true }); assert.equal(r.ok, false, slot); }
  assert.deepEqual(liveOf(s), {}); assert.equal(listQuarantine(s).length, 1, 'every refusal changed nothing');
  assert.ok((await claimQuarantine(s, A, 'q1', { adultConfirmed: true })).ok);
});

test('incorrect ownership: the wrong adult claims, then the right account cannot get the data twice; double claim is refused', async () => {
  const s = legacyStore(); const before = liveOf(s);
  await activateAccount(s, B); assert.ok((await claimQuarantine(s, B, 'q1', { adultConfirmed: true })).ok); assert.deepEqual(liveOf(s), before);
  // data now belongs to B (a person chose that); A signs in and sees nothing of it
  await activateAccount(s, A); assert.deepEqual(liveOf(s), {}); assert.equal(listQuarantine(s).length, 0);
  await activateAccount(s, B); assert.deepEqual(liveOf(s), before, 'B keeps it; nothing duplicated for A');
  const again = await claimQuarantine(s, B, 'q1', { adultConfirmed: true }); assert.deepEqual([again.ok, !again.ok && again.reason], [false, 'no-such-slot']);
});

test('claim never mixes: an account that already has progress cannot absorb held data; both stay intact', async () => {
  const s = legacyStore(); const held = liveOf(s);
  await activateAccount(s, A); s.data.set(LEGACY_KEYS.abc, '{"X":true}');
  const r = await claimQuarantine(s, A, 'q1', { adultConfirmed: true }); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'would-mix']);
  assert.equal(s.data.get(LEGACY_KEYS.abc), '{"X":true}'); assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), held);
});

test('claim keeps the account\'s own preferences and curriculum choice, restores only missing keys', async () => {
  const s = legacyStore(); s.data.set('littleGeniusTheme', 'old'); await activateAccount(s, A);
  s.data.set('littleGeniusTheme', 'mine'); s.data.set(PROFILE_KEY, '{"schema":1}');
  const r = await claimQuarantine(s, A, 'q1', { adultConfirmed: true }); assert.ok(r.ok);
  assert.equal(s.data.get('littleGeniusTheme'), 'mine'); assert.equal(s.data.get(PROFILE_KEY), '{"schema":1}');
  assert.ok(r.ok && r.keptOwnKeys.includes('littleGeniusTheme')); assert.ok(progressLive(s).length >= 3);
});

test('claim write failure at every step: partial writes are removed, the held copy stays, a retry succeeds', async () => {
  for (let n = 1; n <= 8; n++) {
    const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v);
    const held = liveOf(s); await activateAccount(s, A); assert.deepEqual(liveOf(s), {});
    s.ops = 0; s.failAt = n;
    const r = await claimQuarantine(s, A, 'q1', { adultConfirmed: true });
    if (r.ok) { assert.deepEqual(liveOf(s), held); continue; }
    assert.equal(r.reason, 'restore-failed', 'n=' + n);
    assert.deepEqual(liveOf(s), {}, 'no partial data left live, n=' + n); assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), held);
    s.failAt = 0; assert.ok((await claimQuarantine(s, A, 'q1', { adultConfirmed: true })).ok); assert.deepEqual(liveOf(s), held);
  }
});

test('claim with a silent write loss is detected (read-back) and rolled back', async () => {
  const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v);
  await activateAccount(s, A); s.ops = 0; s.failAt = 2; s.failMode = 'drop';
  const r = await claimQuarantine(s, A, 'q1', { adultConfirmed: true }); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'restore-failed']);
  assert.deepEqual(liveOf(s), {}); assert.ok(s.data.has(VAULT_PREFIX + 'q1'));
});

test('FAULT INJECTION: a failure at any single storage operation of an account switch never loses data and never shows A\'s data to B', async () => {
  const build = async (): Promise<FaultStore> => { const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v); s.data.set(PROFILE_KEY, '{"schema":1}'); await claimed(s, A); await activateAccount(s, B); s.data.set('littleGeniusTheme', 'b-theme'); await activateAccount(s, A); return s; };
  const reference = await build(); const aData = liveOf(reference); const total = (() => { reference.ops = 0; return 0; })(); void total;
  for (const mode of ['throw', 'drop'] as const) {
    for (let n = 1; n <= 30; n++) {
      const s = await build(); s.ops = 0; s.failAt = n; s.failMode = mode;
      const r = await activateAccount(s, B);
      if (r.ok) assert.deepEqual(progressLive(s), [], `${mode}#${n}: B must not see A's progress`);
      else for (const k of PROGRESS_KEYS) assert.ok(!(k in liveOf(s)) || s.data.get(ACTIVE_OWNER_KEY) === (await ownerKey(A)) || s.data.has(JOURNAL_KEY), `${mode}#${n}: failed switch must not expose data as B's`);
      // once storage works again every account recovers its own exact data
      s.failAt = 0;
      const ra = await activateAccount(s, A); assert.ok(ra.ok, `${mode}#${n}: A recovers`); assert.deepEqual(liveOf(s), aData, `${mode}#${n}: A's bytes intact`);
      const rb = await activateAccount(s, B); assert.ok(rb.ok, `${mode}#${n}: B recovers`); assert.deepEqual(progressLive(s), [], `${mode}#${n}: B sees no progress after recovery`);
      assert.equal(s.data.get('littleGeniusTheme'), 'b-theme', `${mode}#${n}: B's own data intact`);
    }
  }
});

test('FAULT INJECTION: quarantining legacy data fails at any operation → nothing lost, nothing assigned, the app is told not to mount', async () => {
  for (let n = 1; n <= 6; n++) {
    const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v);
    const held = liveOf(s); s.ops = 0; s.failAt = n;
    const r = await activateAccount(s, A);
    if (r.ok) { assert.deepEqual(liveOf(s), {}); assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), held); continue; }
    assert.ok(['stash-failed', 'clear-failed', 'pointer-failed', 'restore-failed'].includes(r.reason), r.reason);
    s.failAt = 0; const r2 = await activateAccount(s, A); assert.ok(r2.ok);
    assert.deepEqual(liveOf(s), {}); assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + 'q1')!), held, 'n=' + n);
  }
});

test('storage unreadable or blocked: activation fails closed, nothing is written', async () => {
  const s = legacyStore(); s.throwOnGet = true; s.resetCounters(); const before = everything(s);
  const r = await activateAccount(s, A); assert.equal(r.ok, false); assert.equal(s.writes.length + s.removes.length, 0);
  s.throwOnGet = false; assert.equal(everything(s), before);
  const s2 = legacyStore(); s2.failAllWrites = true; const r2 = await activateAccount(s2, A); assert.equal(r2.ok, false); assert.deepEqual(liveOf(s2), liveOf(legacyStore()));
});

test('quarantine full (20 held sets) refuses to proceed instead of overwriting; identical data is deduplicated', async () => {
  const s = new MemStore(); for (let i = 1; i <= 20; i++) s.data.set(VAULT_PREFIX + 'q' + i, JSON.stringify({ littleGeniusTheme: 'v' + i }));
  s.data.set(LEGACY_KEYS.abc, '{"A":true}');
  const r = await activateAccount(s, A); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'stash-failed']); assert.equal(s.data.get(LEGACY_KEYS.abc), '{"A":true}');
  const d = new MemStore(); d.data.set(LEGACY_KEYS.abc, '{"A":true}'); await activateAccount(d, A);
  d.data.set(LEGACY_KEYS.abc, '{"A":true}'); await activateAccount(d, B); // same bytes appear again for another account after A is parked? A had none live, so dedupe applies to quarantine only
  assert.equal(listQuarantine(d).length, 1);
});

test('corrupt owner pointer, corrupt journal, corrupt vault: live data is quarantined or left untouched, never assigned', async () => {
  const s1 = legacyStore(); await claimed(s1, A); const aData = liveOf(s1); s1.data.set(ACTIVE_OWNER_KEY, 'garbage');
  const r1 = await activateAccount(s1, A); assert.ok(r1.ok && r1.quarantined); assert.deepEqual(liveOf(s1), {});
  assert.deepEqual(JSON.parse(s1.data.get(VAULT_PREFIX + r1.quarantined!)!), aData, 'A\'s data is held, recoverable by an adult claim');
  const s2 = legacyStore(); await claimed(s2, A); const a2 = liveOf(s2); s2.data.set(JOURNAL_KEY, '{not json');
  const r2 = await activateAccount(s2, B); assert.ok(r2.ok && r2.quarantined); assert.deepEqual(liveOf(s2), {}); assert.ok(!s2.data.has(JOURNAL_KEY));
  assert.deepEqual(JSON.parse(s2.data.get(VAULT_PREFIX + r2.quarantined!)!), a2);
  const s3 = new MemStore(); s3.data.set(VAULT_PREFIX + (await ownerKey(A)), 'broken'); const r3 = await activateAccount(s3, A);
  assert.deepEqual([r3.ok, !r3.ok && r3.reason], [false, 'restore-failed']); assert.equal(s3.data.get(VAULT_PREFIX + (await ownerKey(A))), 'broken');
});

test('account recovery: the owner pointer is lost after A signed out; A signs back in and gets everything from the vault', async () => {
  const s = legacyStore(); await claimed(s, A); const aData = liveOf(s);
  assert.ok((await signOutSafely(s)).proceed); assert.deepEqual(liveOf(s), {});
  await activateAccount(s, B); s.data.set('littleGeniusTheme', 'b'); s.data.delete(ACTIVE_OWNER_KEY); // pointer lost
  const rb = await activateAccount(s, B); assert.ok(rb.ok && rb.quarantined, 'B\'s data is held, not guessed');
  const ra = await activateAccount(s, A); assert.ok(ra.ok); assert.deepEqual(liveOf(s), aData);
});

test('multiple tabs: two tabs activating different accounts concurrently end in a consistent state with no mixing', async () => {
  const s = legacyStore(); await claimed(s, A); const aData = liveOf(s);
  const [rb, rc] = await Promise.all([activateAccount(s, B), activateAccount(s, C)]);
  assert.ok(rb.ok && rc.ok);
  const owner = s.data.get(ACTIVE_OWNER_KEY); assert.ok(owner === await ownerKey(B) || owner === await ownerKey(C));
  assert.deepEqual(progressLive(s), []);
  assert.deepEqual(JSON.parse(s.data.get(VAULT_PREFIX + (await ownerKey(A)))!), aData, 'A\'s parked data is exactly intact');
  assert.ok(!s.data.has(JOURNAL_KEY));
});

test('multiple tabs: the same account in two tabs is unchanged and does not duplicate or move anything', async () => {
  const s = legacyStore(); await claimed(s, A); const before = everything(s);
  const rs = await Promise.all([activateAccount(s, A), activateAccount(s, A), activateAccount(s, A)]);
  assert.ok(rs.every((r) => r.ok && r.action === 'unchanged')); assert.equal(everything(s), before);
});

test('sign-out on a shared device: data parked, none live, same account restored; a second account never sees it', async () => {
  const s = legacyStore(); await claimed(s, A); const aData = liveOf(s);
  assert.deepEqual(await signOutSafely(s), { proceed: true }); assert.deepEqual(liveOf(s), {}); assert.ok(!s.data.has(ACTIVE_OWNER_KEY));
  await activateAccount(s, B); assert.deepEqual(liveOf(s), {});
  await activateAccount(s, A); assert.deepEqual(liveOf(s), aData);
});

test('sign-out failure is NOT silent: proceed=false with a reason, data intact and still the owner\'s, marker set; retry works', async () => {
  const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v); await claimed(s, A); const aData = liveOf(s);
  s.failPrefix = VAULT_PREFIX;
  const r = await signOutSafely(s); assert.equal(r.proceed, false); assert.ok(r.reason);
  assert.deepEqual(liveOf(s), aData, 'nothing half-cleared'); assert.equal(s.data.get(ACTIVE_OWNER_KEY), await ownerKey(A));
  s.failPrefix = ''; assert.equal(s.data.get(SIGNOUT_FAILED_KEY), await ownerKey(A));
  assert.deepEqual(await signOutSafely(s), { proceed: true }); assert.deepEqual(liveOf(s), {});
  await activateAccount(s, A); assert.deepEqual(liveOf(s), aData);
});

test('sign-out park failing at ANY operation never leaves a half-emptied or mixed state', async () => {
  for (const mode of ['throw', 'drop'] as const) for (let n = 1; n <= 20; n++) {
    const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v); await claimed(s, A); const aData = liveOf(s);
    s.ops = 0; s.failAt = n; s.failMode = mode;
    const r = await parkAccount(s);
    if (!r.ok) { const live = liveOf(s); assert.ok(Object.keys(live).length === 0 || JSON.stringify(live) === JSON.stringify(aData), `${mode}#${n}: live is all-or-nothing`); }
    s.failAt = 0;
    const rb = await activateAccount(s, B); assert.ok(rb.ok, `${mode}#${n}`); assert.deepEqual(progressLive(s), [], `${mode}#${n}: B sees nothing`);
    await activateAccount(s, A); assert.deepEqual(liveOf(s), aData, `${mode}#${n}: A recovers every byte`);
  }
});

test('forced sign-out after a failed park: the next account either gets a verified copy-away or the app is not mounted; never A\'s data', async () => {
  const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v); await claimed(s, A); const aData = liveOf(s);
  s.failPrefix = VAULT_PREFIX; await signOutSafely(s); // user chose "sign out anyway": data stays live under A's pointer
  const r = await activateAccount(s, B); assert.equal(r.ok, false, 'storage still failing: B must not be mounted'); assert.deepEqual(liveOf(s), aData);
  s.failPrefix = ''; const r2 = await activateAccount(s, B); assert.ok(r2.ok); assert.deepEqual(progressLive(s), []);
  await activateAccount(s, A); assert.deepEqual(liveOf(s), aData);
});

test('existing progress is never silently deleted: across a long mixed sequence every progress byte is still somewhere', async () => {
  const s = legacyStore(); const original = liveOf(s);
  await activateAccount(s, A); await activateAccount(s, B); await signOutSafely(s); await activateAccount(s, C); await activateAccount(s, A);
  const all = [...s.data.entries()].filter(([k]) => k.startsWith(VAULT_PREFIX)).map(([, v]) => v).join('|') + JSON.stringify(liveOf(s));
  for (const v of Object.values(original)) assert.ok(all.includes(JSON.stringify(v).slice(1, -1).replace(/\\"/g, '\\"')) || all.includes(v.slice(0, 20)), 'original value still stored');
});

test('sign-out retries once: a single transient storage error does not block sign-out', async () => {
  const s = new FaultStore(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v); await claimed(s, A); const aData = liveOf(s);
  s.ops = 0; s.failAt = 1; // the first copy attempt fails once
  assert.deepEqual(await signOutSafely(s), { proceed: true }); assert.deepEqual(liveOf(s), {});
  await activateAccount(s, A); assert.deepEqual(liveOf(s), aData);
});

test('park whose clear cannot finish puts the exact data back: the owner never sees a half-emptied state', async () => {
  class Stuck extends MemStore { stuck = ''; override removeItem(k: string): void { if (k === this.stuck) throw new Error('blocked'); super.removeItem(k); } }
  const s = new Stuck(); for (const [k, v] of Object.entries(liveOf(legacyStore()))) s.data.set(k, v); await claimed(s, A); const aData = liveOf(s);
  s.stuck = 'littleGeniusLanguage'; const withLang = liveOf(s);
  const r = await parkAccount(s); assert.equal(r.ok, false);
  assert.deepEqual(liveOf(s), withLang, 'every key is still there, byte for byte');
  assert.equal(s.data.get(ACTIVE_OWNER_KEY), await ownerKey(A));
});

test('identical held data that reappears is deduplicated into the same slot, not copied again', async () => {
  const s = legacyStore(); const bytes = liveOf(s);
  await activateAccount(s, A); s.data.delete(ACTIVE_OWNER_KEY);
  for (const [k, v] of Object.entries(bytes)) s.data.set(k, v);
  await activateAccount(s, B); assert.deepEqual(listQuarantine(s).map((q) => q.slot), ['q1']);
});

test('claim is refused while an account switch is unfinished', async () => {
  const s = legacyStore(); await activateAccount(s, A);
  s.data.set(JOURNAL_KEY, JSON.stringify({ step: 'cleared', from: await ownerKey(A), to: await ownerKey(B) }));
  const r = await claimQuarantine(s, A, 'q1', { adultConfirmed: true }); assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'busy']); assert.deepEqual(liveOf(s), {});
});
