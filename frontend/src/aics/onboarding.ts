import { getCountry } from './countryRegistry.ts';
import { getFramework } from './curriculumRegistry.ts';
import { safeLocalStorage } from './bootstrap.ts';
import {
  LANGUAGE_LABEL, MODULE_LABEL, SETTING_LABEL, SETTINGS, STAGES, STAGE_LABEL, STEPS,
  applyCountry, buildProfile, clearOnboardingData, countryOptions, decideOnboarding, defaultFrameworkFor, dismissParentPrompt,
  effectiveSelection, frameworkOptions, languageOptions, nextStep, overlayInfo, parentPromptVisible, prevStep, readProfile,
  saveProfile, validateStep,
} from './onboardingService.ts';
import type { Answers, Lang, ModuleId, StepId } from './onboardingService.ts';
import type { StorageLike } from './types.ts';

// Phase 3 onboarding screens. DOM is built with textContent only (no innerHTML), so registry or stored values can never inject markup.
// No network calls, timers, tracking or child data. Choices are stored on this device by onboardingService.

export type WizardOutcome = 'saved' | 'skipped' | 'cancelled';
export interface Deps {
  gate: () => Promise<boolean>; // the app's existing grown-up check (injected so this module never imports app code)
  confirm?: (message: string) => Promise<boolean>; // the app's in-app confirm dialog
  storage?: StorageLike | null;
  now?: () => string;
}

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

const STYLE_ID = 'lga-ob-style';
const CSS = `
.lga-ob{box-sizing:border-box;max-width:680px;margin:0 auto;padding:20px 16px 32px;font-family:inherit;color:inherit}
.lga-ob *{box-sizing:border-box}
.lga-ob-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.lga-ob-step{margin:0;font-weight:700}
.lga-ob-dots{display:flex;gap:6px}.lga-ob-dots i{width:10px;height:10px;border-radius:50%;background:#cfd8dc;display:block}.lga-ob-dots i.on{background:#2e7d32}
.lga-ob h1{font-size:1.6rem;line-height:1.25;margin:8px 0}.lga-ob h1:focus{outline:none}
.lga-ob-help{margin:0 0 14px;line-height:1.5}
.lga-ob fieldset{border:0;margin:0 0 12px;padding:0}.lga-ob legend{position:absolute;left:-9999px}
.lga-ob-opt{display:flex;gap:12px;align-items:flex-start;min-height:48px;padding:12px 14px;margin:0 0 10px;border:2px solid #cfd8dc;border-radius:14px;background:#fff;color:#1b2a1f;cursor:pointer}
.lga-ob-opt:has(input:checked){border-color:#2e7d32;background:#f1f8e9}
.lga-ob-opt:focus-within{outline:3px solid #1565c0;outline-offset:2px}
.lga-ob-opt input{width:22px;height:22px;margin:2px 0 0;flex:none}
.lga-ob-opt b{display:block}.lga-ob-opt small{display:block;margin-top:2px;color:#455a64}
.lga-ob-badge{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;background:#fff3e0;border:1px solid #ef6c00;color:#7a3d00;font-size:.75rem;font-weight:700}
.lga-ob-note{padding:10px 12px;border-radius:12px;background:#e8f1fb;color:#10304f;margin:0 0 12px;line-height:1.45}
.lga-ob-error{min-height:1.2em;margin:4px 0;color:#b00020;font-weight:700}
.lga-ob-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.lga-ob button{min-height:48px;min-width:48px;padding:10px 18px;border-radius:14px;font:inherit;font-weight:700;cursor:pointer;border:2px solid #2e7d32}
.lga-ob button:focus-visible{outline:3px solid #1565c0;outline-offset:2px}
.lga-ob-primary{background:#2e7d32;color:#fff}.lga-ob-secondary{background:#fff;color:#1b5e20}
.lga-ob-link{background:none;border:0!important;text-decoration:underline;color:inherit;padding:10px 4px!important}
.lga-ob dl{margin:0 0 12px}.lga-ob dt{font-weight:700;margin-top:10px}.lga-ob dd{margin:2px 0 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.lga-ob-wait{text-align:center;padding:40px 16px}
.lga-ob-overlay{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:rgba(255,255,255,.98)}
.lga-ob-card{margin-top:16px}
`;
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.append(s);
}

const TITLES: Record<StepId, string> = {
  setting: 'Welcome, grown-up',
  country: 'Where will your child learn?',
  curriculum: 'Choose a curriculum',
  stage: 'How old is your learner?',
  languages: 'Languages and extras',
  review: 'Check your choices',
};

function option(type: 'radio' | 'checkbox', name: string, value: string, checked: boolean, title: string, note?: string, badge?: string, disabled = false): HTMLLabelElement {
  const input = h('input', { type, name, value, checked, disabled });
  input.checked = checked;
  const text = h('span', {}, h('b', {}, title, badge ? h('span', { class: 'lga-ob-badge' }, badge) : null), note ? h('small', {}, note) : null);
  return h('label', { class: 'lga-ob-opt' }, input, text);
}

/** Opens the wizard in `host`. Resolves when the adult saves, skips or (edit mode) cancels. Never throws. */
export function openWizard(opts: { mode: 'first-run' | 'edit'; host: HTMLElement; storage: StorageLike | null; initial?: Answers; now?: () => string }): Promise<WizardOutcome> {
  ensureStyle();
  const { mode, host, storage } = opts;
  return new Promise<WizardOutcome>((resolve) => {
    let step: StepId = 'setting';
    let answers: Answers = { ...(opts.initial ?? {}) };
    let message = '';
    let done = false;
    let observer: MutationObserver | null = null;
    const finish = (o: WizardOutcome) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      host.removeEventListener('lga-ob-abandon', abandon);
      observer?.disconnect();
      if (o !== 'cancelled' || mode === 'edit') host.replaceChildren();
      resolve(o);
    };
    // If the app replaces this screen (for example the licence page after a demo ends), stop quietly and never write anything.
    const abandon = () => finish('cancelled');
    host.addEventListener('lga-ob-abandon', abandon);
    if (mode === 'first-run' && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => { if (!done && !host.querySelector('.lga-ob')) abandon(); });
      observer.observe(host, { childList: true });
    }
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape' && mode === 'edit') finish('cancelled'); }
    document.addEventListener('keydown', onKey);

    const skip = () => {
      if (storage) saveProfile(storage, buildProfile({}, 'skipped', opts.now)); // failure is fine: defaults apply anyway
      finish('skipped');
    };
    const go = (to: StepId | null) => { if (!to) return; step = to; message = ''; render(true); };
    const collect = (form: HTMLFormElement) => {
      const fd = new FormData(form);
      if (step === 'setting') answers.setting = (fd.get('setting') as never) ?? undefined;
      if (step === 'country') {
        const c = fd.get('country');
        if (typeof c === 'string') answers = applyCountry(answers, c);
      }
      if (step === 'curriculum') answers.frameworkId = (fd.get('framework') as string) ?? undefined;
      if (step === 'stage') answers.stage = (fd.get('stage') as never) ?? undefined;
      if (step === 'languages') {
        answers.languages = fd.getAll('lang') as Lang[];
        answers.modules = fd.getAll('module') as ModuleId[];
      }
    };

    const save = () => {
      let profile;
      try { profile = buildProfile(answers, 'completed', opts.now); } catch (e) { message = String((e as Error).message); render(false); return; }
      if (!storage) { message = 'This browser cannot save settings. You can continue with the defaults.'; render(false); return; }
      const r = saveProfile(storage, profile);
      if (r.ok) finish('saved');
      else { message = r.error + ' You can try again, or continue with the defaults.'; render(false); }
    };

    function body(form: HTMLFormElement): void {
      const country = answers.countryCode ?? '';
      if (step === 'setting') {
        form.append(
          h('p', { class: 'lga-ob-help' }, 'These questions are for adults. They help Little Genius suggest the right learning path. We never ask for a child’s name, birthday, photo, voice or location, and your answers stay on this device.'),
          h('fieldset', {}, h('legend', {}, 'Who is setting this up?'),
            ...SETTINGS.map((s) => option('radio', 'setting', s, answers.setting === s, SETTING_LABEL[s]))),
          h('p', { class: 'lga-ob-note' }, 'This only changes how we word things. It does not change what you can open or do in the app.'),
        );
      } else if (step === 'country') {
        form.append(
          h('p', { class: 'lga-ob-help' }, 'Pick the country whose early-years programme you follow. Not sure? Choose “Another country or not listed”.'),
          h('fieldset', {}, h('legend', {}, 'Country'),
            ...countryOptions().map((c) => option('radio', 'country', c.code, country === c.code, c.name))),
        );
      } else if (step === 'curriculum') {
        const opts2 = frameworkOptions(country);
        const overlays = overlayInfo(country);
        form.append(
          h('p', { class: 'lga-ob-help' }, 'Curriculum options for ' + (getCountry(country)?.name ?? 'your country') + '.'),
          h('fieldset', {}, h('legend', {}, 'Curriculum'),
            ...opts2.map((f) => option('radio', 'framework', f.id, (answers.frameworkId ?? defaultFrameworkFor(country)) === f.id, f.name,
              f.kind === 'base' && f.id === 'intl-core' ? 'Little Genius’s own balanced early-years plan. Not an official national curriculum.' : 'Version ' + f.version + '. Source checked on ' + (f.verifiedDate ?? 'not yet') + '.',
              f.status === 'published' ? undefined : 'Draft'))),
          ...overlays.map((o) => h('p', { class: 'lga-ob-note' }, 'Also applies in this country: ' + o.name + ' (Draft, not yet reviewed). It is added on top of your choice.')),
          h('p', { class: 'lga-ob-note' }, 'Draft means not yet reviewed by an educator. Your choice is saved, but the activities your child sees stay the same until reviewed packs are released.'),
        );
      } else if (step === 'stage') {
        form.append(
          h('p', { class: 'lga-ob-help' }, 'Choose the closest age range. You can change it later in Parent Corner.'),
          h('fieldset', {}, h('legend', {}, 'Age range'), ...STAGES.map((s) => option('radio', 'stage', s, answers.stage === s, STAGE_LABEL[s]))),
        );
      } else if (step === 'languages') {
        const langs = languageOptions(country);
        const chosen = new Set(answers.languages ?? ['en']);
        form.append(
          h('p', { class: 'lga-ob-help' }, 'Choose the languages you would like to see offered.'),
          h('fieldset', {}, h('legend', {}, 'Languages'),
            ...langs.map((l) => option('checkbox', 'lang', l, chosen.has(l), LANGUAGE_LABEL[l], l === 'en' ? undefined : 'Draft until a native-speaking educator has reviewed it. Voices come from your device.', l === 'en' ? undefined : 'Draft'))),
          h('fieldset', {}, h('legend', {}, 'Optional modules'),
            option('checkbox', 'module', 'faith-values', (answers.modules ?? []).includes('faith-values'), MODULE_LABEL['faith-values'], 'You decide. It is never switched on because of your country. No content is available yet.', 'Draft')),
        );
      } else {
        const fw = answers.frameworkId ? getFramework(answers.frameworkId) : undefined;
        const row = (label: string, value: string, to: StepId) => [
          h('dt', {}, label),
          h('dd', {}, h('span', {}, value), h('button', { type: 'button', class: 'lga-ob-secondary', 'data-goto': to, 'aria-label': 'Change ' + label.toLowerCase() }, 'Change')),
        ];
        form.append(
          h('dl', {},
            ...row('Setting', answers.setting ? SETTING_LABEL[answers.setting] : '—', 'setting'),
            ...row('Country', getCountry(country)?.name ?? '—', 'country'),
            ...row('Curriculum', (fw?.name ?? '—') + (fw && fw.status !== 'published' ? ' (Draft)' : ''), 'curriculum'),
            ...row('Age range', answers.stage ? STAGE_LABEL[answers.stage] : '—', 'stage'),
            ...row('Languages', (answers.languages ?? []).map((l) => LANGUAGE_LABEL[l]).join(', ') || '—', 'languages'),
            ...row('Optional modules', (answers.modules ?? []).length ? (answers.modules ?? []).map((m) => MODULE_LABEL[m]).join(', ') : 'None', 'languages')),
          h('p', { class: 'lga-ob-note' }, 'Saved on this device only. You can change or clear these choices any time in Parent Corner.'),
        );
      }
    }

    function render(focus: boolean): void {
      const idx = STEPS.indexOf(step);
      const form = h('form', { novalidate: true });
      body(form);
      const err = h('p', { class: 'lga-ob-error', role: 'alert', id: 'lga-ob-error' }, message);
      const actions = h('div', { class: 'lga-ob-actions' });
      const back = prevStep(step);
      if (back) actions.append(h('button', { type: 'button', class: 'lga-ob-secondary', 'data-back': '1' }, 'Back'));
      else if (mode === 'edit') actions.append(h('button', { type: 'button', class: 'lga-ob-secondary', 'data-cancel': '1' }, 'Cancel'));
      actions.append(h('button', { type: 'submit', class: 'lga-ob-primary' }, step === 'review' ? 'Save and start' : 'Continue'));
      form.append(err, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        collect(form);
        const problems = validateStep(step, answers);
        if (problems.length) { message = problems[0]; err.textContent = message; return; }
        if (step === 'review') { save(); return; }
        go(nextStep(step, answers));
      });
      form.addEventListener('click', (e) => {
        const t = (e.target as HTMLElement).closest<HTMLElement>('[data-back],[data-cancel],[data-goto]');
        if (!t) return;
        if (t.dataset.cancel) { finish('cancelled'); return; }
        collect(form);
        if (t.dataset.back) go(prevStep(step));
        else if (t.dataset.goto) go(t.dataset.goto as StepId);
      });

      const title = h('h1', { id: 'lga-ob-title', tabindex: '-1' }, TITLES[step]);
      const root = h('section', { class: 'lga-ob', role: 'region', 'aria-labelledby': 'lga-ob-title' },
        h('div', { class: 'lga-ob-top' },
          h('p', { class: 'lga-ob-step', 'aria-live': 'polite' }, 'Step ' + (idx + 1) + ' of ' + STEPS.length),
          h('div', { class: 'lga-ob-dots', 'aria-hidden': 'true' }, ...STEPS.map((_, i) => h('i', { class: i <= idx ? 'on' : '' })))),
        title, form,
        mode === 'first-run' ? h('button', { type: 'button', class: 'lga-ob-link', 'data-skip': '1' }, 'Skip setup and use International Core') : null);
      root.querySelector('[data-skip]')?.addEventListener('click', skip);
      host.replaceChildren(root);
      if (focus) title.focus();
    }
    render(true);
  });
}

// ---------- Parent Corner card (grown-up area; already behind the app's grown-up gate) ----------
const CARD_ID = 'lga-curriculum-section';
let cardDeps: Deps | null = null;
let listenerInstalled = false;

function summaryText(storage: StorageLike | null): string {
  const s = effectiveSelection(storage);
  const fw = getFramework(s.baseFrameworkId)?.name ?? 'International Core';
  const country = getCountry(s.countryCode)?.name ?? 'International';
  const langs = s.languages.map((l) => LANGUAGE_LABEL[l]).join(', ');
  return (s.isDefault ? 'Using the default: ' : 'Your choice: ') + fw + ' · ' + country + ' · ' + langs + (s.publishable ? '' : ' (Draft, not yet reviewed)');
}

function renderCard(): void {
  const deps = cardDeps;
  if (!deps) return;
  const storage = deps.storage === undefined ? safeLocalStorage() : deps.storage;
  const page = document.querySelector('.kid-parent');
  if (!page) return;
  document.getElementById(CARD_ID)?.remove();
  ensureStyle();
  const hasProfile = !!storage && readProfile(storage) !== null;
  const card = h('section', { class: 'kid-settings-panel lga-ob-card', id: CARD_ID, 'aria-labelledby': 'lga-cur-h' },
    h('h2', { id: 'lga-cur-h' }, 'Curriculum & Language'),
    h('p', { id: 'lga-cur-summary', role: 'status' }, summaryText(storage)),
  );
  if (parentPromptVisible(storage)) {
    const dismiss = h('button', { type: 'button', class: 'lga-parent-outline', 'data-lga-ob': 'dismiss' }, 'Dismiss');
    card.append(h('p', { class: 'lga-ob-note' }, 'New: you can choose a curriculum and languages for your family or class. Everything keeps working as before if you do nothing.'), dismiss);
  }
  const open = h('button', { type: 'button', class: 'lga-parent-main', 'data-lga-ob': 'open' }, 'Choose curriculum & language');
  const row = h('div', { class: 'lga-parent-buttons' }, open);
  if (hasProfile) row.append(h('button', { type: 'button', class: 'lga-parent-outline', 'data-lga-ob': 'clear' }, 'Reset curriculum preferences'));
  card.append(row, h('p', { class: 'lga-parent-muted' }, 'Curriculum packs are Draft until reviewed. Choices are saved on this device only. No child details are collected.'));

  card.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-lga-ob]');
    if (!t) return;
    const act = t.dataset.lgaOb;
    if (act === 'dismiss') { dismissParentPrompt(storage); renderCard(); return; }
    if (act === 'clear') {
      const ok = deps.confirm ? await deps.confirm('Reset your curriculum and language preferences? Learning progress is not deleted.') : true;
      if (ok && storage) { clearOnboardingData(storage); renderCard(); }
      return;
    }
    if (act === 'open') {
      const overlay = h('div', { class: 'lga-ob-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Curriculum and language setup' });
      document.body.append(overlay);
      // Close if the learning app is replaced underneath (for example the licence page after a demo ends).
      const root = page.closest('.kid-app')?.parentElement ?? page.parentElement;
      const watcher = root && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => { if (!document.querySelector('.kid-app')) overlay.dispatchEvent(new Event('lga-ob-abandon')); })
        : null;
      watcher?.observe(root!, { childList: true });
      const p = storage ? readProfile(storage) : null;
      const initial: Answers = p ? { setting: p.setting, countryCode: p.countryCode, frameworkId: p.frameworkId, stage: p.stage, languages: [...p.languages], modules: [...p.modules] } : {};
      await openWizard({ mode: 'edit', host: overlay, storage, initial, now: deps.now });
      watcher?.disconnect();
      overlay.remove();
      renderCard();
      (document.querySelector('#' + CARD_ID + ' [data-lga-ob="open"]') as HTMLElement | null)?.focus();
    }
  });
  const before = page.querySelector('.lga-parent-licence');
  if (before) page.insertBefore(card, before);
  else page.append(card);
}

let running: Promise<void> | null = null;

/**
 * Entry point called once from the app before the learning screens mount.
 * - Always registers the Parent Corner card (so existing users can find the option).
 * - Shows the wizard only to a browser with no profile and no earlier app data, after the grown-up check.
 * - Never throws and never blocks: any failure means the app simply opens with International Core defaults.
 */
export function maybeRunOnboarding(host: HTMLElement, deps: Deps): Promise<void> {
  try {
    cardDeps = deps;
    if (!listenerInstalled) {
      listenerInstalled = true;
      document.addEventListener('lga-parent-rendered', () => { try { renderCard(); } catch { /* card is optional */ } });
    }
  } catch { /* optional */ }
  if (running) return running;
  const p: Promise<void> = (async () => {
    try {
      const storage = deps.storage === undefined ? safeLocalStorage() : deps.storage;
      if (!decideOnboarding(storage).run) return;
      const wait = h('p', { class: 'lga-ob-wait' }, 'Getting ready…');
      host.replaceChildren(wait);
      ensureStyle();
      const adult = await deps.gate();
      if (!wait.isConnected) return; // the app replaced this screen meanwhile (e.g. licence page): do nothing
      if (!adult) {
        if (storage) saveProfile(storage, buildProfile({}, 'skipped', deps.now)); // do not ask again; adults can set up in Parent Corner
        return;
      }
      await openWizard({ mode: 'first-run', host, storage, now: deps.now });
    } catch { /* onboarding is optional */ }
  })();
  running = p;
  void p.finally(() => { if (running === p) running = null; });
  return p;
}

/** Test helper. */
export function _resetOnboardingForTests(): void { running = null; cardDeps = null; }
