import type { AuditEntry, PackView } from './ownerCurriculum.ts';
import type { Release, ReviewRole } from './packRelease.ts';

// Phase 8 Owner Curriculum Manager UI. A display layer only: the server enforces owner-only access on every call (ownerCurriculum.ts).
// Shown only when the app says this account is the owner. DOM is built with textContent (no innerHTML). Every state change is confirmed.
// Reviews entered here are OWNER-RECORDED notes about who reviewed; the app cannot verify anyone's credentials.

export interface ManagerApi {
  get(url: string): Promise<{ data: unknown }>;
  post(url: string, body: unknown): Promise<{ data: unknown }>;
}
export interface ManagerDeps { api: ManagerApi; isOwner: () => boolean; confirm: (message: string) => Promise<boolean> }

export const MANAGER_BUTTON_ID = 'lga-curriculum-manager-button';
export const MANAGER_OVERLAY_ID = 'lga-curriculum-manager';

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else el.setAttribute(k, v); }
  for (const c of kids) if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}
const errText = (e: unknown): string => {
  const r = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof r === 'string' ? r : e instanceof Error ? e.message : 'Something went wrong. Nothing was changed.';
};
const STATE_LABEL: Record<string, string> = { draft: 'Draft', 'in-review': 'In review', approved: 'Approved (not live)', published: 'Published (live)', superseded: 'Replaced by a newer release', archived: 'Archived (not live)' };
const ROLE_LABEL: Record<ReviewRole, string> = { educator: 'Educator', 'primary-source': 'Primary-source check', 'native-educator': 'Native-language educator' };

let deps: ManagerDeps | null = null;
let listener = false;

function css(): void {
  if (document.getElementById('lga-mgr-style')) return;
  const s = document.createElement('style'); s.id = 'lga-mgr-style';
  s.textContent = '.lga-mgr{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#fff;color:#1b1b1b;padding:16px;font:inherit}.lga-mgr section{border:2px solid #cfd8dc;border-radius:16px;padding:12px;margin:12px 0}.lga-mgr button{min-height:48px;padding:8px 16px;border-radius:12px;font:inherit;font-weight:700;border:2px solid #2e7d32;background:#fff;cursor:pointer;margin:4px 4px 4px 0}.lga-mgr button.lga-mgr-go{background:#2e7d32;color:#fff}.lga-mgr button.lga-mgr-danger{border-color:#b71c1c;color:#b71c1c}.lga-mgr input,.lga-mgr select{min-height:44px;font:inherit;margin:4px 4px 4px 0}.lga-mgr .lga-mgr-bad{color:#b71c1c}.lga-mgr small{display:block;color:#455a64}';
  document.head.append(s);
}

async function call<T>(fn: () => Promise<{ data: unknown }>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try { return { ok: true, data: (await fn()).data as T }; } catch (e) { return { ok: false, error: errText(e) }; }
}

export async function openManager(): Promise<void> {
  const d = deps; if (!d || !d.isOwner()) return;
  css();
  document.getElementById(MANAGER_OVERLAY_ID)?.remove();
  const root = h('div', { class: 'lga-mgr', id: MANAGER_OVERLAY_ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Curriculum packs' });
  document.body.append(root);
  const msg = h('p', { role: 'status', id: 'lga-mgr-msg' });
  const close = h('button', { type: 'button', 'data-mgr': 'close' }, 'Close');
  close.addEventListener('click', () => root.remove());

  const reload = async (note?: string): Promise<void> => {
    const packsRes = await call<{ packs: PackView[] }>(() => d.api.get('/api/curriculum/owner/packs'));
    const auditRes = await call<{ audit: AuditEntry[] }>(() => d.api.get('/api/curriculum/owner/audit'));
    root.replaceChildren(h('h1', {}, 'Curriculum packs'), h('p', {}, 'Nothing reaches children until a pack is published here and every check passes. Reviews recorded here are your own notes; the app cannot verify anyone\'s credentials.'), msg, close);
    msg.textContent = note ?? '';
    if (!packsRes.ok) { root.append(h('p', { class: 'lga-mgr-bad' }, packsRes.error)); return; }
    for (const p of packsRes.data.packs) root.append(card(p));
    if (auditRes.ok) root.append(h('section', {}, h('h2', {}, 'History'), h('ul', {}, ...auditRes.data.audit.slice(0, 30).map((a) => h('li', {}, a.at.slice(0, 16).replace('T', ' ') + ' · ' + a.action + ' · ' + a.releaseId + (a.detail ? ' · ' + a.detail : ''))))));
  };

  const act = async (action: string, body: Record<string, unknown>, confirmText: string | null): Promise<void> => {
    if (confirmText && !(await d.confirm(confirmText))) return;
    const r = await call(() => d.api.post('/api/curriculum/owner/' + action, body));
    await reload(r.ok ? 'Done.' : r.error);
  };

  const card = (p: PackView): HTMLElement => {
    const rel: Release | null = p.release;
    const el = h('section', { 'data-pack': p.frameworkId, 'aria-label': p.name },
      h('h2', {}, p.name + ' · version ' + p.version),
      h('p', {}, rel ? 'Status: ' + (STATE_LABEL[rel.state] ?? rel.state) + (p.isCurrent ? ' · children currently receive this pack' : '') : 'No release started.'));
    if (!p.selectable) el.append(h('p', { class: 'lga-mgr-bad' }, 'Tracked only: not yet effective, cannot be released.'));
    if (p.revoked) el.append(h('p', { class: 'lga-mgr-bad', 'data-mgr-revoked': '1' }, 'REVOKED: this exact content is permanently blocked. Change the content to release a corrected version.'));
    if (p.gates.blockers.length) {
      const det = h('details', {}, h('summary', {}, p.gates.blockers.length + ' check' + (p.gates.blockers.length === 1 ? '' : 's') + ' not passed'), h('ul', {}, ...p.gates.blockers.slice(0, 40).map((b) => h('li', { class: 'lga-mgr-bad' }, b))));
      el.append(det);
    } else el.append(h('p', {}, 'All checks pass for the current content.'));
    el.append(h('small', {}, 'Reviews needed: ' + p.gates.requiredRoles.map((r) => ROLE_LABEL[r]).join(', ')));
    if (rel?.reviews.length) el.append(h('ul', {}, ...rel.reviews.map((r) => h('li', {}, ROLE_LABEL[r.role] + ': ' + r.reviewer + (r.digest === p.gates.digest ? '' : ' (older content, no longer counts)') + ' (owner-recorded)'))));
    const btn = (label: string, mgr: string, fn: () => void, cls = ''): HTMLButtonElement => { const b = h('button', { type: 'button', 'data-mgr': mgr, class: cls }, label); b.addEventListener('click', fn); return b; };
    if (!rel) { if (p.selectable) el.append(btn('Start a release', 'create', () => void act('create', { frameworkId: p.frameworkId }, null))); return el; }
    const base = { releaseId: rel.id, expectedRev: rel.rev };
    if (rel.state === 'draft' || rel.state === 'in-review') {
      const role = h('select', { 'aria-label': 'Review type' }, ...p.gates.requiredRoles.map((r) => h('option', { value: r }, ROLE_LABEL[r])));
      const who = h('input', { type: 'text', maxlength: '80', placeholder: 'Reviewer name', 'aria-label': 'Reviewer name' });
      const note = h('input', { type: 'text', maxlength: '300', placeholder: 'Note (optional)', 'aria-label': 'Review note' });
      el.append(h('div', {}, role, who, note, btn('Record review', 'review', () => void act('review', { ...base, role: role.value, reviewer: who.value, note: note.value }, null))));
    }
    if (rel.state === 'draft') el.append(btn('Submit for review', 'submit', () => void act('submit', base, null)));
    if (rel.state === 'in-review') el.append(btn('Approve', 'approve', () => void act('approve', base, 'Approve ' + p.name + ' version ' + p.version + '? Approving does not make it live.'), 'lga-mgr-go'));
    if (rel.state === 'approved') el.append(btn('Publish to children', 'publish', () => void act('publish', base, 'Publish ' + p.name + '? Children on this app will receive this pack. You can archive it at any time.'), 'lga-mgr-go'));
    if (rel.state !== 'archived') {
      const reason = h('input', { type: 'text', maxlength: '200', placeholder: 'Reason', 'aria-label': 'Reason for archiving' });
      el.append(h('div', {}, reason, btn(rel.state === 'published' ? 'Archive (take offline)' : 'Archive', 'archive', () => void act('archive', { ...base, reason: reason.value }, 'Archive this release? Children will get the original screens instead.'), 'lga-mgr-danger')));
    }
    {
      const why = h('input', { type: 'text', maxlength: '200', placeholder: 'What is wrong? (required)', 'aria-label': 'Reason for emergency revoke' });
      el.append(h('div', {}, h('small', {}, 'Emergency revoke: takes this content off every device that is online right away. Devices that are offline cannot be told: they keep it for up to 24 hours after their last connection, then stop.'), why,
        btn('Emergency revoke', 'revoke', () => void act('revoke', { frameworkId: p.frameworkId, reason: why.value }, 'EMERGENCY REVOKE ' + p.name + '? This exact content is blocked permanently and children get the original screens. Online devices stop within about half an hour; offline devices within 24 hours of their last connection (not immediately).'), 'lga-mgr-danger')));
    }
    for (const old of p.history) {
      if ((old.state === 'superseded' || old.state === 'archived') && old.publishedAt) el.append(btn('Roll back to version ' + old.version, 'rollback', () => void act('rollback', { releaseId: old.id, expectedRev: old.rev }, 'Make version ' + old.version + ' live again? It must still match this build and pass every check.')));
    }
    return el;
  };

  await reload();
  (root.querySelector('[data-mgr="close"]') as HTMLElement | null)?.focus();
}

function attachButton(): void {
  const d = deps; if (!d || !d.isOwner()) return;
  const slot = document.querySelector('#lga-owner-slot'); if (!slot || slot.querySelector('#' + MANAGER_BUTTON_ID)) return;
  const b = h('button', { type: 'button', id: MANAGER_BUTTON_ID, class: 'lga-main' }, 'Curriculum packs');
  b.addEventListener('click', () => { void openManager(); });
  slot.append(b);
}

/** Called once from the app. The button appears in Parent Corner for the owner only; the server enforces the rest. Never throws. */
export function installOwnerManager(d: ManagerDeps): void {
  try { deps = d; if (!listener) { listener = true; document.addEventListener('lga-parent-rendered', () => { try { attachButton(); } catch { /* optional */ } }); } } catch { /* optional */ }
}
