import { LANGUAGE_LABEL, LANGUAGES, STAGES, STAGE_LABEL, countryOptions, defaultFrameworkFor, frameworkOptions, languageOptions } from './onboardingService.ts';
import type { Lang, Stage } from './onboardingService.ts';
import { MAX_CLASSES, syncSchoolDefaults, validateSchoolConfig } from './schoolConfig.ts';
import type { ConfigInput, SchoolCurriculumConfig } from './schoolConfig.ts';
import type { StorageLike } from './types.ts';

// Phase 9: School Portal curriculum settings screen (Parent Corner, licensed accounts only).
// A display and form layer. The SERVER decides who may read or write (schoolService.ts: licence from the caller's own verified sign-in,
// write only for the licence-holder e-mail); this screen sends no school id, licence id or role. Class labels only: never children's names.
// Settings reach children only once the matching curriculum pack is published (Phase 8); until then the app keeps its original screens.

export interface SettingsApi { get(url: string): Promise<{ data: unknown }>; put(url: string, body: unknown): Promise<{ data: unknown }> }
export interface SettingsDeps { api: SettingsApi; isLicensed: () => boolean; confirm: (message: string) => Promise<boolean>; storage?: StorageLike | null }

export const SETTINGS_BUTTON_ID = 'lga-school-settings-button';
export const SETTINGS_OVERLAY_ID = 'lga-school-settings';

// ---------------------------------------------------------------- pure form model (unit-tested without a DOM)
export interface ClassDraft { id: string; name: string; stage: Stage; frameworkId: string | null; languages: Lang[] }
export interface Draft { countryCode: string; frameworkId: string; stages: Stage[]; defaultStage: Stage; languages: Lang[]; classes: ClassDraft[] }

const first = <T>(a: readonly T[], fallback: T): T => (a.length ? a[0] : fallback);

export function emptyDraft(): Draft {
  const countryCode = first(countryOptions(), { code: 'INTL', name: '' }).code;
  return { countryCode, frameworkId: defaultFrameworkFor(countryCode), stages: ['A3', 'A4', 'A5'], defaultStage: 'A4', languages: ['en'], classes: [] };
}
export function draftFromConfig(c: SchoolCurriculumConfig | null): Draft {
  if (!c) return emptyDraft();
  return { countryCode: c.countryCode, frameworkId: c.frameworkId, stages: [...c.stages], defaultStage: c.defaultStage, languages: [...c.languages], classes: c.classes.map((x) => ({ ...x, languages: [...x.languages] })) };
}
/** Changing country resets everything that depends on it, so an invalid combination cannot be built from the screen. */
export function withCountry(d: Draft, countryCode: string): Draft {
  const langs = languageOptions(countryCode);
  const frameworkIds = frameworkOptions(countryCode).map((f) => f.id);
  const keep = d.languages.filter((l) => langs.includes(l));
  const languages: Lang[] = keep.length ? keep : ['en'];
  return { ...d, countryCode, frameworkId: defaultFrameworkFor(countryCode), languages,
    classes: d.classes.map((c) => ({ ...c, frameworkId: c.frameworkId && frameworkIds.includes(c.frameworkId) ? c.frameworkId : null, languages: c.languages.filter((l) => languages.includes(l)).length ? c.languages.filter((l) => languages.includes(l)) : [...languages] })) };
}
export function classIdFor(name: string, taken: readonly string[]): string {
  const base = (name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'class');
  let id = base; let n = 2;
  while (taken.includes(id)) { id = base.slice(0, 28) + '-' + n++; }
  return id;
}
export function addClass(d: Draft): Draft {
  if (d.classes.length >= MAX_CLASSES) return d;
  const id = classIdFor('class', d.classes.map((c) => c.id));
  return { ...d, classes: [...d.classes, { id, name: '', stage: d.defaultStage, frameworkId: null, languages: [...d.languages] }] };
}
/** Draft -> request body. Class ids are derived from names for NEW classes only; existing ids never change. Version is the one last read from the server. */
export function toBody(d: Draft, version: number): ConfigInput {
  const taken: string[] = [];
  const classes = d.classes.map((c) => {
    const id = /^[a-z0-9-]{1,32}$/.test(c.id) && c.id !== 'class' && !taken.includes(c.id) ? c.id : classIdFor(c.name, taken);
    taken.push(id);
    return { id, name: c.name.trim(), stage: c.stage, frameworkId: c.frameworkId, languages: [...c.languages] };
  });
  return { schema: 1, countryCode: d.countryCode, frameworkId: d.frameworkId, stages: STAGES.filter((s) => d.stages.includes(s)), defaultStage: d.defaultStage, languages: LANGUAGES.filter((l) => d.languages.includes(l)), classes, version };
}
/** Plain-language problems for a body, or [] when it would be accepted. Uses the same validation the server runs. */
export function friendlyProblems(body: ConfigInput): string[] {
  const v = validateSchoolConfig(body);
  if (v.ok) return [];
  const map: [RegExp, string][] = [
    [/unknown country/, 'Choose a country.'], [/curriculum not available/, 'Choose one of the listed curricula.'], [/bad languages/, 'Choose at least one language.'],
    [/bad age bands/, 'Choose at least one age band.'], [/default age band/, 'The default age band must be one of the age bands you teach.'],
    [/too many classes/, 'You can add up to ' + MAX_CLASSES + ' classes.'], [/bad class name/, 'Every class needs a short name (up to 40 characters, no < or >).'],
    [/class age band/, 'A class age band must be one of the age bands the school teaches.'], [/class languages/, 'A class can only use languages the school has chosen.'],
    [/class curriculum/, 'A class curriculum must be one offered for the chosen country.'], [/duplicate class id/, 'Two classes have the same name. Give each class its own name.'],
  ];
  const out = new Set<string>();
  for (const e of v.errors) out.add(map.find(([re]) => re.test(e))?.[1] ?? 'Please check the highlighted settings.');
  return [...out];
}

// ---------------------------------------------------------------- UI
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else el.setAttribute(k, v); }
  for (const c of kids) if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}
const errInfo = (e: unknown): { status: number | null; text: string } => {
  const r = (e as { response?: { status?: unknown; data?: { error?: unknown } } })?.response;
  const status = typeof r?.status === 'number' ? r.status : null;
  const text = typeof r?.data?.error === 'string' ? r.data.error : e instanceof Error ? e.message : 'Something went wrong. Nothing was changed.';
  return { status, text };
};

let deps: SettingsDeps | null = null;
let listener = false;

function css(): void {
  if (document.getElementById('lga-ss-style')) return;
  const s = document.createElement('style'); s.id = 'lga-ss-style';
  s.textContent = '.lga-ss{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#fff;color:#1b1b1b;padding:16px;font:inherit}.lga-ss section{border:2px solid #cfd8dc;border-radius:16px;padding:12px;margin:12px 0}.lga-ss label{display:block;margin:6px 0}.lga-ss button{min-height:48px;padding:8px 16px;border-radius:12px;font:inherit;font-weight:700;border:2px solid #2e7d32;background:#fff;cursor:pointer;margin:4px 4px 4px 0}.lga-ss button.lga-ss-go{background:#2e7d32;color:#fff}.lga-ss button.lga-ss-danger{border-color:#b71c1c;color:#b71c1c}.lga-ss input[type=text],.lga-ss select{min-height:44px;font:inherit;margin:4px 4px 4px 0;max-width:100%}.lga-ss .lga-ss-bad{color:#b71c1c}.lga-ss small{display:block;color:#455a64}';
  document.head.append(s);
}

export async function openSettings(): Promise<void> {
  const d = deps; if (!d || !d.isLicensed()) return;
  css();
  document.getElementById(SETTINGS_OVERLAY_ID)?.remove();
  const root = h('div', { class: 'lga-ss', id: SETTINGS_OVERLAY_ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'School curriculum settings' });
  document.body.append(root);
  const msg = h('p', { role: 'status', id: 'lga-ss-msg' });
  const close = h('button', { type: 'button', 'data-ss': 'close' }, 'Close'); close.addEventListener('click', () => root.remove());
  const header = (): HTMLElement[] => [h('h1', {}, 'School curriculum settings'), msg, close];

  let loaded: { config: SchoolCurriculumConfig | null; canEdit: boolean; licensedUntil: string } | null = null;
  let draft: Draft = emptyDraft(); let version = 0;

  const load = async (note?: string): Promise<void> => {
    root.replaceChildren(...header(), h('p', {}, 'Loading…')); msg.textContent = note ?? '';
    try {
      const r = (await d.api.get('/api/school/curriculum')).data as { config?: SchoolCurriculumConfig | null; canEdit?: unknown; licensedUntil?: unknown } | null;
      const cfg = r && r.config ? r.config : null;
      const v = cfg ? validateSchoolConfig(cfg) : null;
      if (cfg && (!v || !v.ok)) { root.replaceChildren(...header(), h('p', { class: 'lga-ss-bad' }, 'The saved settings could not be read. Nothing was changed.')); return; }
      loaded = { config: cfg, canEdit: r?.canEdit === true, licensedUntil: typeof r?.licensedUntil === 'string' ? r.licensedUntil : '' };
      draft = draftFromConfig(cfg); version = cfg?.version ?? 0;
      render(note);
    } catch (e) { const i = errInfo(e); root.replaceChildren(...header(), h('p', { class: 'lga-ss-bad' }, i.status === 403 ? 'This account does not have an active school licence.' : i.text)); }
  };

  const save = async (): Promise<void> => {
    const body = toBody(draft, version);
    const problems = friendlyProblems(body);
    if (problems.length) { render(problems.join(' ')); return; }
    if (!(await d.confirm('Save these settings for your whole school? Adults signing in with the school licence will see them as defaults. They never replace an adult\'s own choice.'))) return;
    try {
      const r = (await d.api.put('/api/school/curriculum', body)).data as { config?: SchoolCurriculumConfig } | null;
      if (d.storage) await syncSchoolDefaults({ get: (u) => d.api.get(u) }, d.storage, 'licensed').catch(() => undefined);
      if (r?.config) { loaded = { config: r.config, canEdit: true, licensedUntil: loaded?.licensedUntil ?? '' }; draft = draftFromConfig(r.config); version = r.config.version; }
      render('Saved.');
    } catch (e) {
      const i = errInfo(e);
      if (i.status === 409) { await load('These settings were changed somewhere else. The latest version is shown; please make your changes again.'); return; }
      if (i.status === 403) { render('Only the licence holder can change school curriculum settings. Nothing was changed.'); return; }
      render(i.text);
    }
  };

  const render = (note?: string): void => {
    const canEdit = !!loaded?.canEdit;
    msg.textContent = note ?? '';
    const dis: Record<string, string> = canEdit ? {} : { disabled: 'disabled' };
    const form = h('div', {});
    const warn = h('section', {}, h('p', {}, 'Use class names such as "Sunflowers" or "Room 3". Never type a child\'s name here.'),
      h('p', {}, 'These settings only reach children once the matching curriculum has been published and checked. Until then the app keeps its original screens.'),
      !canEdit && h('p', { class: 'lga-ss-bad', 'data-ss': 'readonly' }, 'You can see these settings, but only the licence holder can change them.'));
    const sel = (label: string, value: string, opts: { value: string; label: string }[], on: (v: string) => void, name: string): HTMLElement => {
      const s = h('select', { 'aria-label': label, 'data-ss': name, ...dis }, ...opts.map((o) => { const op = h('option', { value: o.value }, o.label); if (o.value === value) op.selected = true; return op; }));
      s.addEventListener('change', () => on(s.value)); return h('label', {}, label + ' ', s);
    };
    const checks = <T extends string>(label: string, all: readonly T[], on: readonly T[], text: (v: T) => string, set: (next: T[]) => void, name: string): HTMLElement =>
      h('fieldset', { 'data-ss': name }, h('legend', {}, label), ...all.map((v) => { const c = h('input', { type: 'checkbox', value: v, ...dis }); c.checked = on.includes(v); c.addEventListener('change', () => { set(all.filter((x) => (x === v ? c.checked : on.includes(x)))); }); return h('label', {}, c, ' ' + text(v)); }));
    const fwOpts = frameworkOptions(draft.countryCode).map((f) => ({ value: f.id, label: f.name }));
    const langOpts = languageOptions(draft.countryCode);
    const refresh = (): void => render();
    form.append(h('section', {},
      sel('Country', draft.countryCode, countryOptions().map((c) => ({ value: c.code, label: c.name })), (v) => { draft = withCountry(draft, v); refresh(); }, 'country'),
      sel('Curriculum', draft.frameworkId, fwOpts, (v) => { draft = { ...draft, frameworkId: v }; }, 'framework'),
      checks('Age bands the school teaches', STAGES, draft.stages, (s) => STAGE_LABEL[s], (n) => { const stages = n.length ? n : draft.stages; draft = { ...draft, stages, defaultStage: stages.includes(draft.defaultStage) ? draft.defaultStage : stages[0], classes: draft.classes.map((c) => (stages.includes(c.stage) ? c : { ...c, stage: stages[0] })) }; refresh(); }, 'stages'),
      sel('Default age band', draft.defaultStage, draft.stages.map((s) => ({ value: s, label: STAGE_LABEL[s] })), (v) => { draft = { ...draft, defaultStage: v as Stage }; }, 'defaultStage'),
      checks('Languages', langOpts, draft.languages, (l) => LANGUAGE_LABEL[l], (n) => { const languages = n.length ? n : draft.languages; draft = { ...draft, languages, classes: draft.classes.map((c) => ({ ...c, languages: c.languages.filter((l) => languages.includes(l)).length ? c.languages.filter((l) => languages.includes(l)) : [...languages] })) }; refresh(); }, 'languages'),
    ));
    const cls = h('section', { 'data-ss': 'classes' }, h('h2', {}, 'Classes (' + draft.classes.length + ' of ' + MAX_CLASSES + ')'));
    draft.classes.forEach((c, i) => {
      const name = h('input', { type: 'text', maxlength: '40', value: c.name, placeholder: 'Class name', 'aria-label': 'Class ' + (i + 1) + ' name', ...dis });
      name.addEventListener('input', () => { draft.classes[i] = { ...draft.classes[i], name: name.value }; });
      const rm = h('button', { type: 'button', 'data-ss': 'remove-class', class: 'lga-ss-danger', ...dis }, 'Remove'); rm.addEventListener('click', () => { draft = { ...draft, classes: draft.classes.filter((_, j) => j !== i) }; refresh(); });
      cls.append(h('div', { 'data-class': String(i) }, name,
        sel('Age band', c.stage, draft.stages.map((s) => ({ value: s, label: STAGE_LABEL[s] })), (v) => { draft.classes[i] = { ...draft.classes[i], stage: v as Stage }; }, 'class-stage'),
        sel('Curriculum', c.frameworkId ?? '', [{ value: '', label: 'Same as the school' }, ...fwOpts], (v) => { draft.classes[i] = { ...draft.classes[i], frameworkId: v || null }; }, 'class-framework'),
        checks('Languages', draft.languages, c.languages, (l) => LANGUAGE_LABEL[l], (n) => { draft.classes[i] = { ...draft.classes[i], languages: n.length ? n : draft.classes[i].languages }; refresh(); }, 'class-languages'), rm));
    });
    const add = h('button', { type: 'button', 'data-ss': 'add-class', ...(canEdit && draft.classes.length < MAX_CLASSES ? {} : { disabled: 'disabled' }) }, 'Add a class'); add.addEventListener('click', () => { draft = addClass(draft); refresh(); });
    cls.append(add);
    const saveBtn = h('button', { type: 'button', 'data-ss': 'save', class: 'lga-ss-go' }, 'Save for the whole school'); saveBtn.addEventListener('click', () => { void save(); });
    const tail: Node[] = [];
    if (canEdit) tail.push(saveBtn);
    if (loaded?.licensedUntil) tail.push(h('small', {}, 'Licence valid until ' + loaded.licensedUntil.slice(0, 10)));
    root.replaceChildren(...header(), warn, form, cls, ...tail);
  };

  await load();
  (root.querySelector('[data-ss="close"]') as HTMLElement | null)?.focus();
}

function attachButton(): void {
  const d = deps; if (!d || !d.isLicensed()) return;
  const slot = document.querySelector('#lga-owner-slot'); if (!slot || slot.querySelector('#' + SETTINGS_BUTTON_ID)) return;
  const b = h('button', { type: 'button', id: SETTINGS_BUTTON_ID, class: 'lga-main' }, 'School curriculum settings');
  b.addEventListener('click', () => { void openSettings(); });
  slot.append(b);
}

/** Called once from the app. The button appears in Parent Corner for licensed accounts only; the server enforces who may read or write. Never throws. */
export function installSchoolSettings(x: SettingsDeps): void {
  try { deps = x; if (!listener) { listener = true; document.addEventListener('lga-parent-rendered', () => { try { attachButton(); } catch { /* optional */ } }); } } catch { /* optional */ }
}
