import { collectSixGameSnapshot, restoreSixGameSnapshot, validSixGameSnapshot, sixGameCounts, type SixGameSnapshot } from './sixGameSnapshot';
import { parkAccount } from './aics/accountScope';
import { grownUpCheck } from './grownUp';
import { safeLocalStorage } from './aics/bootstrap';
import { readProfile, saveProfile, validateProfile, type AdultProfile } from './aics/onboardingService';

// Local development only. No real customer identities, licensed accounts or child details.
type Adult = { id: string; email: string };
type PracticeResult = { gameId: string; bestScore: number; lastScore: number; attempts: number };
type RoundResult = { gameId: string; score: number; total: number };
type AlphabetSnapshot = { letters: string[]; courseComplete: boolean };
type LegacySnapshot = {
  lost: { current: number; completed: string[] };
  picture: { last: string | null; letters: Record<string, { success: number; wrong: number }> };
  quests: { completed: string[] };
};
const LEGACY_STORAGE_KEYS = ['littleGeniusLostLettersV1', 'littleGeniusPictureRescue', 'littleGeniusAdventureQuests'] as const;
function safeObject(raw: string | null): Record<string, unknown> {
  try { const x: unknown = JSON.parse(raw || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {}; }
  catch { return {}; }
}
function collectLegacySnapshot(): LegacySnapshot | null {
  const storage = safeLocalStorage(); if (!storage) return null;
  const lost = safeObject(storage.getItem(LEGACY_STORAGE_KEYS[0]));
  const picture = safeObject(storage.getItem(LEGACY_STORAGE_KEYS[1]));
  const quests = safeObject(storage.getItem(LEGACY_STORAGE_KEYS[2]));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const completed = (obj: Record<string, unknown>) => [...letters].filter(k => obj[k] === true);
  const lCompleted = lost.completed && typeof lost.completed === 'object' && !Array.isArray(lost.completed)
    ? completed(lost.completed as Record<string, unknown>) : [];
  const picLetters: LegacySnapshot['picture']['letters'] = {};
  for (const k of letters) {
    const item = picture[k]; if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const x = item as Record<string, unknown>;
    const success = x.success, wrong = x.wrong;
    picLetters[k] = {
      success: Number.isInteger(success) && Number(success) >= 0 ? Math.min(Number(success), 10000) : 0,
      wrong: Number.isInteger(wrong) && Number(wrong) >= 0 ? Math.min(Number(wrong), 10000) : 0
    };
  }
  return {
    lost: { current: Number.isInteger(lost.current) ? Math.max(0, Math.min(25, Number(lost.current))) : 0, completed: lCompleted },
    picture: { last: typeof picture.last === 'string' && /^[A-Z]$/.test(picture.last) ? picture.last : null, letters: picLetters },
    quests: { completed: ['forest', 'space', 'ocean'].filter(k => quests[k] === true) }
  };
}
function validLegacySnapshot(x: unknown): x is LegacySnapshot {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const a = x as Record<string, unknown>;
  if (Object.keys(a).sort().join(',') !== 'lost,picture,quests') return false;
  const l = a.lost as Record<string, unknown> | null;
  const p = a.picture as Record<string, unknown> | null;
  const q = a.quests as Record<string, unknown> | null;
  const validLetters = (v: unknown) => Array.isArray(v) && v.length <= 26 &&
    v.every(k => typeof k === 'string' && /^[A-Z]$/.test(k)) && new Set(v).size === v.length;
  if (!l || !Number.isInteger(l.current) || Number(l.current) < 0 || Number(l.current) > 25 || !validLetters(l.completed) || Object.keys(l).sort().join(',') !== 'completed,current') return false;
  if (!p || !(p.last === null || typeof p.last === 'string' && /^[A-Z]$/.test(p.last)) || !p.letters || typeof p.letters !== 'object' || Array.isArray(p.letters) || Object.keys(p).sort().join(',') !== 'last,letters') return false;
  const pic = p.letters as Record<string, unknown>;
  for (const [k, v] of Object.entries(pic)) {
    if (!/^[A-Z]$/.test(k) || !v || typeof v !== 'object' || Array.isArray(v)) return false;
    const counters = v as Record<string, unknown>;
    if (Object.keys(counters).sort().join(',') !== 'success,wrong' || !['success','wrong'].every(name => Number.isInteger(counters[name]) && Number(counters[name]) >= 0 && Number(counters[name]) <= 10000)) return false;
  }
  return !!q && Object.keys(q).join(',') === 'completed' && Array.isArray(q.completed) && q.completed.length <= 3 &&
    new Set(q.completed).size === q.completed.length && q.completed.every(k => ['forest','space','ocean'].includes(k));
}
function restoreLegacySnapshot(snapshot: LegacySnapshot): boolean {
  const storage = safeLocalStorage(); if (!storage || !validLegacySnapshot(snapshot)) return false;
  const lostCompleted: Record<string, boolean> = {};
  for (const letter of snapshot.lost.completed) lostCompleted[letter] = true;
  const pictures: Record<string, unknown> = { ...snapshot.picture.letters };
  if (snapshot.picture.last) pictures.last = snapshot.picture.last;
  const quests: Record<string, boolean> = {};
  for (const key of snapshot.quests.completed) quests[key] = true;
  // Prepare all values before any write; unrelated browser keys remain untouched.
  const records = [
    JSON.stringify({ current: snapshot.lost.current, completed: lostCompleted }),
    JSON.stringify(pictures), JSON.stringify(quests)
  ];
  try { LEGACY_STORAGE_KEYS.forEach((k, index) => storage.setItem(k, records[index])); return true; }
  catch { return false; }
}

function legacyCounts(snapshot: LegacySnapshot): string {
  const picturePracticed = Object.values(snapshot.picture.letters).filter(v => v.success > 0 || v.wrong > 0).length;
  return `Lost Letters: ${snapshot.lost.completed.length}/26 completed · Picture Rescue: ${picturePracticed}/26 letters practiced · Story Quests: ${snapshot.quests.completed.length}/3 completed`;
}
function clearDeviceLegacyProgress(): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    // Device-only cleanup. Account backups, ABC, game scores and preferences are untouched.
    LEGACY_STORAGE_KEYS.forEach(key => storage.removeItem(key));
    return true;
  } catch { return false; }
}

type Envelope = { adult?: Adult | null; profile?: AdultProfile | null; results?: PracticeResult[]; result?: PracticeResult; snapshot?: AlphabetSnapshot | null; alphabetSnapshot?: AlphabetSnapshot | null; legacySnapshot?: LegacySnapshot | null; sixGameSnapshot?: SixGameSnapshot | null; count?: number; error?: string; ok?: boolean };
const api = async (path: string, method = 'GET', body?: unknown): Promise<Envelope> => {
  const response = await fetch('/api/' + path, {
    method, credentials: 'same-origin',
    // Fastify rejects a POST with Content-Type: application/json but no JSON body.
    // Logout intentionally has no body, so only declare JSON when sending one.
    headers: body === undefined
      ? { 'X-LGA-Local-Client': '1' }
      : { 'Content-Type': 'application/json', 'X-LGA-Local-Client': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json() as Envelope;
  if (!response.ok) throw new Error(data.error ?? `Server error ${response.status}`);
  return data;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
};

export function mountLocalAccount(): void {
  const aside = el('aside');
  aside.className = 'lga-local-panel';
  aside.setAttribute('aria-label', 'Local adult test account');
  const heading = el('strong', 'Local Account · Development Only');
  const stateText = el('p', 'Checking local backend…');
  const profileText = el('p');
  const message = el('p');
  message.setAttribute('role', 'status');
  const actions = el('div');
  actions.className = 'lga-local-actions';
  aside.append(heading, stateText, profileText, actions, message);
  document.body.append(aside);
  let current: Adult | null = null;
  let lastRound: RoundResult | null = null;
  // Existing ABC progress is device-local; it is never uploaded automatically.
  const alphabetStatus = el('p', 'ABC device progress is not saved to accounts automatically.');
  aside.append(alphabetStatus);
  const legacyStatus = el('p', 'Original games: device progress not checked yet.');
  aside.append(legacyStatus);
  const updateLegacyStatus = (): void => {
    const snapshot = collectLegacySnapshot();
    legacyStatus.textContent = snapshot ? `THIS DEVICE ONLY · ${legacyCounts(snapshot)}` : 'Device storage unavailable.';
  };
  updateLegacyStatus();
  const alphabetChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function readDeviceAlphabet(): AlphabetSnapshot | null {
    const storage = safeLocalStorage();
    if (!storage) return null;
    try {
      const raw = JSON.parse(storage.getItem('littleGeniusProgress') || '{}') as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const record = raw as Record<string, unknown>;
      const letters = [...alphabetChars].filter(letter => record[letter] === true);
      const courseComplete = storage.getItem('littleGeniusCourseComplete') === 'yes' && letters.length === 26;
      return { letters, courseComplete };
    } catch { return null; }
  }
  function applyDeviceAlphabet(snapshot: AlphabetSnapshot): boolean {
    const storage = safeLocalStorage();
    if (!storage || !Array.isArray(snapshot.letters) || snapshot.letters.length > 26 ||
        !snapshot.letters.every(x => typeof x === 'string' && /^[A-Z]$/.test(x)) ||
        new Set(snapshot.letters).size !== snapshot.letters.length ||
        typeof snapshot.courseComplete !== 'boolean' ||
        (snapshot.courseComplete && snapshot.letters.length !== 26)) return false;
    // Keep unrelated browser settings, and touch no database records.
    const progress: Record<string, boolean> = {};
    snapshot.letters.forEach(letter => { progress[letter] = true; });
    storage.setItem('littleGeniusProgress', JSON.stringify(progress));
    if (snapshot.courseComplete) storage.setItem('littleGeniusCourseComplete', 'yes');
    else storage.removeItem('littleGeniusCourseComplete');
    return true;
  }
  const progressText = el('p', 'Practice results are not uploaded automatically.');
  aside.append(progressText);
  // Dashboard is account-scoped. We never auto-fetch protected results: the adult
  // must explicitly confirm the password on each load, even after refresh.
  const dashboard = el('section');
  dashboard.className = 'lga-progress-dashboard';
  dashboard.setAttribute('aria-label', 'My Learning Progress - Draft practice');
  aside.append(dashboard);
  let savedResults: PracticeResult[] | null = null;
  let resultsOwnerId: string | null = null;
  let savedAlphabet: AlphabetSnapshot | null = null;
  let savedOriginalGames: LegacySnapshot | null = null;
  let savedSixGames: SixGameSnapshot | null = null;
  let sixGamesLoaded = false;
  const GAMES = [
    { id: 'sorting', title: 'Sorting Safari' },
    { id: 'patterns', title: 'Pattern Parade' },
    { id: 'measurement', title: 'Measurement Mission' },
    { id: 'nature', title: 'Nature Discovery' },
  ] as const;
  function renderDashboard(): void {
    dashboard.replaceChildren();
    const header = el('h2', 'My Learning Progress');
    const note = el('p', 'LOCAL TEST · Draft practice, not an official syllabus assessment.');
    note.className = 'lga-progress-note';
    dashboard.append(header, note);
    if (!current) {
      dashboard.append(el('p', 'Sign in to access your account’s saved Draft practice results.'));
      return;
    }
    if (resultsOwnerId !== current.id || savedResults === null) {
      dashboard.append(el('p', 'Saved results are locked. Select “Load My Learning Progress” and confirm your adult password.'));
      return;
    }
    const byGame = new Map(savedResults.filter(r =>
      GAMES.some(g => g.id === r.gameId) && Number.isInteger(r.bestScore) && r.bestScore >= 0 && r.bestScore <= 4
      && Number.isInteger(r.lastScore) && r.lastScore >= 0 && r.lastScore <= 4
      && Number.isInteger(r.attempts) && r.attempts > 0
    ).map(r => [r.gameId, r]));
    const totalRounds = [...byGame.values()].reduce((sum, r) => sum + r.attempts, 0);
    const count = byGame.size;
    const summary = el('p', `${count} of 4 Draft practice games attempted · ${totalRounds} saved rounds`);
    summary.className = 'lga-progress-summary';
    dashboard.append(summary);
    const cards = el('div');
    cards.className = 'lga-progress-grid';
    for (const game of GAMES) {
      const card = el('article'); card.className = 'lga-progress-card';
      card.append(el('h3', game.title));
      const result = byGame.get(game.id);
      if (result) {
        card.append(el('p', `Best: ${result.bestScore}/4 stars`), el('p', `Last: ${result.lastScore}/4 stars`), el('p', `Saved rounds: ${result.attempts}`));
        const meter = el('progress'); meter.max = 4; meter.value = result.bestScore;
        meter.setAttribute('aria-label', `${game.title} best score ${result.bestScore} out of 4`);
        card.append(meter);
      } else {
        card.append(el('p', 'No saved round yet'));
      }
      cards.append(card);
    }
    dashboard.append(cards);
    const originalHeading = el('h3', 'Original Games · Saved Account Backups');
    dashboard.append(originalHeading);
    const originalNote = el('p', 'Only adult-confirmed PostgreSQL backups are shown here. Device-only progress is separate and may belong to another browser user.');
    originalNote.className = 'lga-progress-note';
    dashboard.append(originalNote);
    const originals = el('div');
    originals.className = 'lga-progress-grid';
    function addSavedCard(name: string, count: number | null, max: number, unit: string): void {
      const card = el('article'); card.className = 'lga-progress-card';
      card.append(el('h3', name));
      if (count === null) {
        card.append(el('p', 'No account backup saved'));
      } else {
        card.append(el('p', `${count}/${max} ${unit}`));
        const meter = el('progress'); meter.max = max; meter.value = count;
        meter.setAttribute('aria-label', `${name} account backup: ${count} of ${max} ${unit}`);
        card.append(meter);
      }
      originals.append(card);
    }
    addSavedCard('ABC Lessons', savedAlphabet ? savedAlphabet.letters.length : null, 26, 'letters practised');
    addSavedCard('Lost Letters Forest', savedOriginalGames ? savedOriginalGames.lost.completed.length : null, 26, 'letters completed');
    addSavedCard('Picture Rescue', savedOriginalGames ? Object.values(savedOriginalGames.picture.letters).filter(v => v.success > 0 || v.wrong > 0).length : null, 26, 'letters practised');
    addSavedCard('Story Quests', savedOriginalGames ? savedOriginalGames.quests.completed.length : null, 3, 'quests completed');
    dashboard.append(originals);
    if (sixGamesLoaded) {
      const totals = savedSixGames ? sixGameCounts(savedSixGames) : null;
      dashboard.append(el('h3', 'Six Learning Games · Account Backup'));
      const sixCards = el('div');
      sixCards.className = 'lga-progress-grid';
      const six = [
        { name: 'Number Galaxy', count: totals?.numbers ?? null, max: 10 },
        { name: 'Addition Garden', count: totals?.addition ?? null, max: 7 },
        { name: 'Sound Forest', count: totals?.phonics ?? null, max: 10 },
        { name: 'Urdu Garden', count: totals?.urdu ?? null, max: 38 },
        { name: 'Word Builder', count: totals?.words ?? null, max: 8 },
        { name: 'Shape Lab', count: totals?.shapes ?? null, max: 5 },
      ];
      for (const game of six) {
        const card = el('article');
        card.className = 'lga-progress-card';
        card.append(el('h3', game.name));
        if (game.count === null) {
          card.append(el('p', 'No account backup saved'));
        } else {
          card.append(el('p', `${game.count}/${game.max} recorded`));
          const meter = el('progress');
          meter.max = game.max;
          meter.value = game.count;
          meter.setAttribute('aria-label', `${game.name}: ${game.count} of ${game.max} recorded`);
          card.append(meter);
        }
        sixCards.append(card);
      }
      dashboard.append(sixCards);
    } else {
      dashboard.append(el('p', 'Six-game account backups are locked. Select Load Six-Game Account Backup and confirm your password.'));
    }
    dashboard.append(el('p', 'Account backup snapshots are not automatic progress syncing and do not prove child achievement. Other original games are not yet connected to this dashboard.'));
  }
  renderDashboard();
  const notify = (text: string): void => { message.textContent = text; };
  const button = (label: string, action: () => void | Promise<void>): HTMLButtonElement => {
    const b = el('button', label);
    b.type = 'button';
    b.addEventListener('click', () => { void Promise.resolve(action()).catch(e => notify((e as Error).message)); });
    return b;
  };
  async function protectedAction(fn: () => Promise<void>): Promise<void> {
    if (!await grownUpCheck()) { notify('Adult check not completed.'); return; }
    await fn();
  }
  function showDeviceProfile(): void {
    const storage = safeLocalStorage();
    const profile = storage && readProfile(storage);
    profileText.textContent = profile
      ? `This browser: ${profile.countryCode} · ${profile.frameworkId} · ${profile.languages.join(', ')} · ${profile.stage}`
      : 'This browser: no saved curriculum selection (use Curriculum & Language first).';
  }
  // Password re-confirmation goes to the server for each protected profile read/write.
  // Passwords are never saved in localStorage or cached in a module/global.
  function confirmPassword(purpose: string, accountEmail: string): Promise<string | null> {
    return new Promise(resolve => {
      const overlay = el('div'); overlay.className = 'lga-local-modal';
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Confirm adult password');
      const box = el('form');
      const title = el('h2', purpose);
      const note = el('p', `Account: ${accountEmail}. Re-enter your LOCAL test-account password.`);
      const pass = el('input'); pass.type = 'password'; pass.autocomplete = 'current-password'; pass.required = true; pass.minLength = 12;
      const submit = el('button', 'Confirm password'); submit.type = 'submit';
      const cancel = el('button', 'Cancel'); cancel.type = 'button';
      let settled = false;
      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        overlay.remove();
        resolve(value);
      };
      cancel.addEventListener('click', () => finish(null));
      box.addEventListener('submit', event => {
        event.preventDefault();
        const value = pass.value; pass.value = '';
        finish(value);
      });
      box.append(title, note, pass, submit, cancel);
      overlay.append(box); document.body.append(overlay); pass.focus();
    });
  }
  async function form(mode: 'register' | 'login'): Promise<void> {
    await protectedAction(async () => {
      const overlay = el('div'); overlay.className = 'lga-local-modal';
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', mode === 'register' ? 'Create local test account' : 'Sign in local test account');
      const box = el('form');
      const title = el('h2', mode === 'register' ? 'Create LOCAL test account' : 'Sign in · LOCAL only');
      const note = el('p', 'Use fictional test credentials only. These accounts have no AppDeploy licences or email verification.');
      const email = el('input'); email.type = 'email'; email.autocomplete = 'username'; email.required = true; email.placeholder = 'test@example.invalid';
      const pass = el('input'); pass.type = 'password'; pass.autocomplete = mode === 'register' ? 'new-password' : 'current-password'; pass.required = true; pass.minLength = 12; pass.placeholder = 'Password (12+ characters)';
      const status = el('p'); status.setAttribute('role', 'status');
      const submit = el('button', mode === 'register' ? 'Create account' : 'Sign in'); submit.type = 'submit';
      const close = button('Cancel', () => overlay.remove());
      box.append(title, note, email, pass, submit, close, status);
      box.addEventListener('submit', event => {
        event.preventDefault();
        submit.disabled = true;
        void api('auth/' + mode, 'POST', { email: email.value, password: pass.value })
          .then(() => { pass.value = ''; location.reload(); })
          .catch(e => { status.textContent = (e as Error).message; })
          .finally(() => { submit.disabled = false; });
      });
      overlay.append(box); document.body.append(overlay); email.focus();
    });
  }
  async function refresh(): Promise<void> {
    updateLegacyStatus();
    showDeviceProfile();
    const data = await api('auth/me');
    const nextAdult = data.adult ?? null;
    if (nextAdult?.id !== current?.id) {
      savedResults = null;
      resultsOwnerId = null;
      savedAlphabet = null;
      savedOriginalGames = null;
      savedSixGames = null;
      sixGamesLoaded = false;
      progressText.textContent = 'Practice results are not uploaded automatically.';
      alphabetStatus.textContent = 'ABC device progress is not saved to accounts automatically.';
      lastRound = null;
    }
    current = nextAdult;
    renderDashboard();
    stateText.textContent = current ? `Signed in: ${current.email}` : 'Not signed in (games still playable).';
    actions.replaceChildren();
    if (!current) {
      actions.append(button('Create test account', () => form('register')), button('Sign in', () => form('login')));
      return;
    }
    actions.append(
      button('Save finished Draft practice round', () => protectedAction(async () => {
        if (!lastRound) { notify('Finish one of the four Draft practice mini-games first.'); return; }
        const email = current?.email;
        if (!email) { notify('Sign in again.'); return; }
        if (!confirm(`Save ${lastRound.gameId} score ${lastRound.score}/${lastRound.total} to ${email}? No child details will be sent.`)) return;
        const password = await confirmPassword('Confirm saving Draft practice result', email);
        if (password === null) return;
        const round = lastRound;
        const data = await api('practice/complete', 'POST', { ...round, password });
        if (current?.email !== email) { notify('Account changed; refresh.'); return; }
        lastRound = null;
        // Show only the newly saved round. The full dashboard remains locked
        // until a separate adult-confirmed read, preventing stale mixed-account data.
        savedResults = null;
        resultsOwnerId = null;
        renderDashboard();
        progressText.textContent = `${data.result?.gameId}: best ${data.result?.bestScore}/4 · attempts ${data.result?.attempts}. Select “Load My Learning Progress” to view the dashboard.`;
        notify('Draft practice result saved to your LOCAL test account.');
      })),
      button('Load My Learning Progress', () => protectedAction(async () => {
        const accountId = current?.id;
        const email = current?.email;
        if (!accountId || !email) return;

        const password = await confirmPassword(
          'Confirm loading all saved learning progress', email
        );
        if (password === null || current?.id !== accountId) return;

        const data = await api('progress/all/load', 'POST', { password });
        if (current?.id !== accountId) return;

        if (data.legacySnapshot && !validLegacySnapshot(data.legacySnapshot)) {
          throw new Error('Invalid original-games account backup.');
        }
        if (data.sixGameSnapshot && !validSixGameSnapshot(data.sixGameSnapshot)) {
          throw new Error('Invalid six-game account backup.');
        }
        if (data.alphabetSnapshot) {
          const alphabet = data.alphabetSnapshot;
          if (!Array.isArray(alphabet.letters) ||
              alphabet.letters.length > 26 ||
              new Set(alphabet.letters).size !== alphabet.letters.length ||
              alphabet.letters.some(k => !/^[A-Z]$/.test(k)) ||
              typeof alphabet.courseComplete !== 'boolean' ||
              (alphabet.courseComplete && alphabet.letters.length !== 26)) {
            throw new Error('Invalid ABC account backup.');
          }
        }

        savedResults = Array.isArray(data.results) ? data.results : [];
        savedAlphabet = data.alphabetSnapshot ?? null;
        savedOriginalGames = data.legacySnapshot ?? null;
        savedSixGames = data.sixGameSnapshot ?? null;
        sixGamesLoaded = true;
        resultsOwnerId = accountId;

        renderDashboard();
        progressText.textContent =
          'Account learning progress loaded. See My Learning Progress below.';
        notify('All available account learning progress loaded.');
      })),
      button('Backup Six Learning Games to Account', () => protectedAction(async () => {
        const accountId = current?.id;
        const email = current?.email;
        if (!accountId || !email) return;

        const snapshot = collectSixGameSnapshot();
        if (!snapshot) {
          notify('Device game progress is unavailable or invalid. Nothing uploaded.');
          return;
        }

        const counts = sixGameCounts(snapshot);
        const details = [
          `Numbers ${counts.numbers}/10`,
          `Addition ${counts.addition}/7`,
          `Sounds ${counts.phonics}/10`,
          `Urdu ${counts.urdu}/38`,
          `Words ${counts.words}/8`,
          `Shapes ${counts.shapes}/5`
        ].join(', ');

        if (!confirm(`Backup this shared browser's six-game progress to ${email}?\n${details}\n\nThis REPLACES this account's previous six-game backup. No automatic syncing.`)) return;

        const password = await confirmPassword('Confirm six-game account backup', email);
        if (password === null || current?.id !== accountId) return;

        await api('six-games/save', 'PUT', { password, snapshot });
        if (current?.id !== accountId) return;

        savedSixGames = null;
        sixGamesLoaded = false;
        renderDashboard();
        notify('Six-game backup saved to this adult account. Load it to view saved progress.');
      })),

      button('Restore Six Learning Games to This Browser', () => protectedAction(async () => {
        const accountId = current?.id;
        const email = current?.email;
        if (!accountId || !email) return;

        const password = await confirmPassword('Confirm six-game backup restore', email);
        if (password === null || current?.id !== accountId) return;

        const data = await api('six-games/load', 'POST', { password });
        if (current?.id !== accountId) return;

        const snapshot = data.sixGameSnapshot;
        if (!snapshot) {
          notify('No six-game account backup found.');
          return;
        }

        if (!validSixGameSnapshot(snapshot)) {
          throw new Error('Invalid account backup. Nothing restored.');
        }

        if (!confirm(`REPLACE only this browser's six-game progress with ${email}'s saved backup?\n\nNumber Galaxy, Addition Garden, Sound Forest, Urdu Garden, Word Builder and Shape Lab will be replaced.\n\nABC, Story Village, daily activity and other account backups will remain untouched.`)) return;

        if (current?.id !== accountId) return;

        if (!restoreSixGameSnapshot(snapshot)) {
          notify('Restore failed. Browser storage may be unavailable. Check existing device progress before retrying.');
          return;
        }

        notify('Six-game progress restored to this browser. Reloading...');
        location.reload();
      })),
      button('Backup ABC letters to this account', () => protectedAction(async () => {
        const email = current?.email;
        if (!email) { notify('Sign in again.'); return; }
        const snapshot = readDeviceAlphabet();
        if (!snapshot) { notify('Browser progress storage is unavailable or invalid.'); return; }
        if (!confirm(`Back up ${snapshot.letters.length}/26 ABC letters from THIS shared browser to ${email}? This replaces that account's previous ABC backup. No automatic sync.`)) return;
        const password = await confirmPassword('Confirm ABC alphabet backup', email);
        if (password === null) return;
        const data = await api('alphabet/save', 'PUT', { password, snapshot });
        if (current?.email !== email) { notify('Account changed; refresh.'); return; }
        savedResults = null; resultsOwnerId = null; savedAlphabet = null; savedOriginalGames = null; renderDashboard();
        alphabetStatus.textContent = `ABC backup saved: ${data.count ?? snapshot.letters.length}/26 letters in this LOCAL test account. Reload dashboard to see updated backup.`;
        notify('ABC progress backed up with adult confirmation.');
      })),
      button('Load ABC backup onto this browser', () => protectedAction(async () => {
        const email = current?.email;
        if (!email) { notify('Sign in again.'); return; }
        const password = await confirmPassword('Confirm loading ABC alphabet backup', email);
        if (password === null) return;
        const data = await api('alphabet/load', 'POST', { password });
        if (current?.email !== email) { notify('Account changed; refresh.'); return; }
        if (!data.snapshot) { alphabetStatus.textContent = 'This account has no saved ABC alphabet backup.'; return; }
        const currentDevice = readDeviceAlphabet();
        if (!confirm(`Restore ${data.snapshot.letters.length}/26 letters from ${email} to THIS browser? Current browser ABC progress (${currentDevice?.letters.length ?? 'unknown'}/26) will be REPLACED. Other account records stay unchanged.`)) return;
        if (!applyDeviceAlphabet(data.snapshot)) { notify('ABC restore blocked: invalid snapshot or browser storage unavailable.'); return; }
        notify('ABC alphabet backup restored to this browser. Refreshing…');
        location.reload();
      })),
      button('Check device original-game counts', () => {
        updateLegacyStatus();
        notify('These counts are stored in THIS browser, not in the signed-in account.');
      }),
      button('Clear ONLY device Forest/Picture/Story progress (QA)', () => protectedAction(async () => {
        const email = current?.email; if (!email) return;
        const before = collectLegacySnapshot();
        if (!before) { notify('Device progress storage unavailable. Nothing cleared.'); return; }
        if (!confirm(`QA ONLY: Clear THIS browser's original-game progress?\n${legacyCounts(before)}\n\nABC, curriculum choices, practice scores and all PostgreSQL account backups will be preserved. Shared browser data may belong to someone else.`)) return;
        const password = await confirmPassword('Confirm DEVICE-ONLY original-games progress reset', email);
        if (password === null) return;
        // Verify account/password against the existing protected endpoint without changing backup.
        await api('legacy/load', 'POST', { password });
        if (current?.email !== email) { notify('Account changed; nothing cleared.'); return; }
        if (!confirm('FINAL CONFIRMATION: Erase only the three original-game progress keys from THIS browser? This cannot be undone without a saved backup.')) return;
        if (!clearDeviceLegacyProgress()) { notify('Browser storage could not be cleared.'); return; }
        updateLegacyStatus();
        notify('Device-only progress cleared. Check counts (0), then Restore from account backup. Database backups remain safe.');
      })),
      button('Backup Forest, Pictures & Story Quests', () => protectedAction(async () => {
        const email = current?.email; if (!email) return;
        const snapshot = collectLegacySnapshot();
        if (!snapshot) { notify('Browser storage is unavailable.'); return; }
        if (!confirm(`Back up this browser's Forest, Picture Rescue and Story Quests progress to ${email}? Previous backup for this account will be replaced. This is NOT automatic syncing.`)) return;
        const password = await confirmPassword('Confirm original games backup', email);
        if (password === null) return;
        await api('legacy/save', 'PUT', { password, snapshot });
        if (current?.email !== email) { notify('Account changed; refresh before continuing.'); return; }
        updateLegacyStatus();
        savedResults = null; resultsOwnerId = null; savedAlphabet = null; savedOriginalGames = null; renderDashboard();
        notify('Original games backed up. Reload My Learning Progress to see updated account snapshots.');
      })),
      button('Restore Forest, Pictures & Story Quests', () => protectedAction(async () => {
        const email = current?.email; if (!email) return;
        const password = await confirmPassword('Confirm original games restore', email);
        if (password === null) return;
        const data = await api('legacy/load', 'POST', { password });
        if (current?.email !== email) { notify('Account changed; nothing restored.'); return; }
        if (!data.legacySnapshot) { notify('No saved original-game backup for this account.'); return; }
        if (!validLegacySnapshot(data.legacySnapshot)) { notify('Invalid backup data. Nothing restored.'); return; }
        if (!confirm(`REPLACE only this browser's Forest, Picture Rescue & Story Quests progress with ${email}'s saved backup? Existing device progress will be overwritten. Other users' database records remain untouched.`)) return;
        if (!restoreLegacySnapshot(data.legacySnapshot)) { notify('Browser storage unavailable. Nothing restored.'); return; }
        notify('Original games backup restored on this browser. Reloading…');
        location.reload();
      })),
      button('Save device choices to this account', () => protectedAction(async () => {
        const storage = safeLocalStorage(); const profile = storage && readProfile(storage);
        if (!profile) { notify('No valid device profile. Choose Curriculum & Language first.'); return; }
        if (!confirm(`Save this device's curriculum choices to ${current?.email}? This replaces any saved choices for that account.`)) return;
        const email = current?.email;
        if (!email) { notify('Account changed; sign in again.'); return; }
        const password = await confirmPassword('Confirm saving curriculum choices', email);
        if (password === null) return;
        await api('profile', 'PUT', { profile, password });
        notify('Saved in your LOCAL database. Refresh and use Load to verify.');
      })),
      button('Load this account choices to device', () => protectedAction(async () => {
        const email = current?.email;
        if (!email) { notify('Account changed; sign in again.'); return; }
        const password = await confirmPassword('Confirm loading saved curriculum choices', email);
        if (password === null) return;
        const data = await api('profile/load', 'POST', { password });
        if (!data.profile) { notify('No saved curriculum preferences for this account.'); return; }
        const validation = validateProfile(data.profile);
        if (!validation.ok) { notify('Saved profile is invalid for this app version; nothing overwritten.'); return; }
        if (!confirm(`Load ${current?.email}'s saved preferences on this browser? This replaces ONLY this browser's AICS preferences, not learning progress.`)) return;
        const storage = safeLocalStorage();
        if (!storage) { notify('Browser storage unavailable.'); return; }
        const result = saveProfile(storage, validation.profile);
        if (!result.ok) { notify(result.error); return; }
        notify('Preferences restored. Refreshing…');
        location.reload();
      })),
      button('Sign out', () => protectedAction(async () => {
        savedResults = null;
        resultsOwnerId = null;
        savedAlphabet = null;
        savedOriginalGames = null;
        savedSixGames = null;
        sixGamesLoaded = false;
        progressText.textContent = 'Practice results are not uploaded automatically.';
        alphabetStatus.textContent = 'ABC device progress is not saved to accounts automatically.';
        renderDashboard();
        await api('auth/logout', 'POST');
        if (!(await parkAccount(safeLocalStorage())).ok) { location.reload(); return; }
        location.reload();
      })),
    );
  }
  document.addEventListener('lga-local-round-complete', (event: Event) => {
    const result = (event as CustomEvent<RoundResult>).detail;
    if (!['sorting','patterns','measurement','nature'].includes(result?.gameId) || result.total !== 4 || !Number.isInteger(result.score)) return;
    lastRound = { ...result };
    progressText.textContent = `Finished ${result.gameId}: ${result.score}/4. Adult may choose to save this round. Nothing uploaded yet.`;
  });
  window.addEventListener('storage', showDeviceProfile);
  void refresh().catch(() => { stateText.textContent = 'Local backend unavailable. Start it on 127.0.0.1:4000.'; showDeviceProfile(); });
}
