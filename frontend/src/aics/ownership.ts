import { claimQuarantine, listQuarantine } from './accountScope.ts';
import type { ClaimResult, QuarantineSlot } from './accountScope.ts';
import { runAicsBootstrap, safeLocalStorage } from './bootstrap.ts';
import type { StorageLike } from './types.ts';

// Phase 7a: explicit, adult-confirmed ownership of browser data saved before accounts were separated (or held after a storage problem).
// The card lives in Parent Corner (already behind the app's grown-up gate) and asks for a second explicit confirmation.
// DOM is built with textContent only. Nothing is ever discarded from here: the only actions are "restore to this account" or leave it on hold.

export interface OwnershipDeps {
  userId: () => unknown;                              // the verified id of the signed-in account (never a user-chosen account type)
  confirm: (message: string) => Promise<boolean>;     // the app's in-app confirm dialog
  storage?: StorageLike | null;
  onClaimed?: () => void;
}

export const OWNERSHIP_CARD_ID = 'lga-ownership-section';
export const OWNERSHIP_BANNER_ID = 'lga-ownership-banner';

export function claimMessage(r: ClaimResult): string {
  if (r.ok) return r.restoredKeys > 0 ? 'Saved progress restored to this account.' : 'Nothing needed restoring.';
  switch (r.reason) {
    case 'would-mix': return 'This account already has saved progress. To avoid mixing records, nothing was changed. The held progress stays safe.';
    case 'restore-failed': return 'Restoring did not finish, so nothing was changed. Free some browser storage and try again. The held progress stays safe.';
    case 'not-active': case 'no-identity': return 'Please sign in again, then retry.';
    default: return 'Nothing was changed. The held progress stays safe.';
  }
}

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else el.setAttribute(k, v); }
  for (const c of kids) if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

let deps: OwnershipDeps | null = null;
let listener = false;
let bannerDismissed = false;
const store = (): StorageLike | null => (deps && deps.storage !== undefined ? deps.storage : safeLocalStorage());

function describeSlot(q: QuarantineSlot, i: number): string {
  return 'Saved set ' + (i + 1) + ': ' + q.progressKeys + ' progress record' + (q.progressKeys === 1 ? '' : 's') + (q.hasProfile ? ', with a curriculum choice' : '');
}

function renderBanner(): void {
  document.getElementById(OWNERSHIP_BANNER_ID)?.remove();
  const s = store();
  if (bannerDismissed || !s || listQuarantine(s).length === 0) return;
  const close = h('button', { type: 'button', 'data-lga-own': 'dismiss-banner', 'aria-label': 'Dismiss this message' }, 'Dismiss');
  const bar = h('div', { id: OWNERSHIP_BANNER_ID, role: 'status', class: 'lga-own-banner' }, h('span', {}, 'Earlier saved progress is on hold. A grown-up can restore it in Parent Corner.'), close);
  close.addEventListener('click', () => { bannerDismissed = true; bar.remove(); });
  document.body.prepend(bar);
}

export function renderOwnershipCard(): void {
  const d = deps; if (!d) return;
  const s = store();
  const page = document.querySelector('.kid-parent');
  document.getElementById(OWNERSHIP_CARD_ID)?.remove();
  renderBanner();
  if (!page || !s) return;
  const slots = listQuarantine(s);
  if (slots.length === 0) return;
  const status = h('p', { role: 'status', id: 'lga-own-status' });
  const card = h('section', { class: 'kid-settings-panel', id: OWNERSHIP_CARD_ID, 'aria-labelledby': 'lga-own-h' },
    h('h2', { id: 'lga-own-h' }, 'Saved progress on hold'),
    h('p', {}, 'Learning progress was found on this device that is not linked to an account. It has been kept safe and is hidden from every account until a grown-up decides. Nothing has been deleted.'),
  );
  slots.forEach((q, i) => {
    card.append(h('div', { class: 'lga-parent-buttons' }, h('span', {}, describeSlot(q, i)),
      h('button', { type: 'button', class: 'lga-parent-main', 'data-lga-own': 'claim', 'data-slot': q.slot }, 'Restore to this account')));
  });
  card.append(status, h('p', { class: 'lga-parent-muted' }, 'Only restore progress that belongs to the child using this account. If this account already has saved progress, nothing is merged.'));
  card.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-lga-own="claim"]');
    if (!t || t.hasAttribute('disabled')) return;
    t.setAttribute('disabled', '');
    try {
      const ok = await d.confirm('Restore this saved progress to the account you are signed in with now? Only do this if it belongs to this account\'s child.');
      if (!ok) return;
      const r = await claimQuarantine(s, d.userId(), t.dataset.slot ?? '', { adultConfirmed: true });
      if (r.ok) { try { runAicsBootstrap(s); } catch { /* derived data is rebuilt on next start */ } try { d.onClaimed?.(); } catch { /* ignore */ } }
      renderOwnershipCard();
      const st = document.getElementById('lga-own-status'); if (st) st.textContent = claimMessage(r);
      else { const c = document.getElementById(OWNERSHIP_CARD_ID) ?? document.querySelector('.kid-parent'); c?.prepend(h('p', { role: 'status' }, claimMessage(r))); }
    } finally { t.removeAttribute('disabled'); }
  });
  const before = page.querySelector('.lga-parent-licence');
  if (before) page.insertBefore(card, before); else page.prepend(card);
}

/** Called once from the app after the account is activated. Never throws. */
export function installOwnership(d: OwnershipDeps): void {
  try {
    deps = d;
    if (!listener) { listener = true; document.addEventListener('lga-parent-rendered', () => { try { renderOwnershipCard(); } catch { /* optional */ } }); }
    renderBanner();
  } catch { /* optional */ }
}
