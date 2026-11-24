import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'lga_local_session';
const SESSION_AGE_S = 60 * 60 * 24 * 7;
const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const attempts = new Map();
const hashToken = token => createHash('sha256').update(token).digest('hex');
const encodeEmail = input => typeof input === 'string' ? input.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 200;

export function validateLocalProfile(profile) {
  const fail = message => ({ valid: false, message });
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return fail('Invalid profile.');
  const keys = ['schema','status','updatedAt','setting','countryCode','frameworkId','stage','languages','modules'];
  if (Object.keys(profile).length !== keys.length || Object.keys(profile).some(k => !keys.includes(k))) return fail('Unexpected profile fields.');
  if (profile.schema !== 1 || !['completed', 'skipped'].includes(profile.status)) return fail('Unsupported profile.');
  if (typeof profile.updatedAt !== 'string' || !Number.isFinite(Date.parse(profile.updatedAt))) return fail('Invalid update date.');
  if (!['home','classroom','school','other'].includes(profile.setting) || !['A3','A4','A5','mixed'].includes(profile.stage)) return fail('Invalid setting or stage.');
  if (typeof profile.countryCode !== 'string' || !/^[A-Z]{2,5}$/.test(profile.countryCode)) return fail('Invalid country.');
  if (typeof profile.frameworkId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(profile.frameworkId)) return fail('Invalid curriculum.');
  if (!Array.isArray(profile.languages) || profile.languages.length < 1 || profile.languages.length > 3 || new Set(profile.languages).size !== profile.languages.length || !profile.languages.every(x => ['en','ur','ar'].includes(x))) return fail('Invalid languages.');
  if (!Array.isArray(profile.modules) || profile.modules.length > 1 || !profile.modules.every(x => x === 'faith-values')) return fail('Invalid modules.');
  return { valid: true };
}

function parseCookies(header) {
  const cookies = new Map();
  for (const piece of (header ?? '').split(';')) {
    const index = piece.indexOf('=');
    if (index > 0) cookies.set(piece.slice(0, index).trim(), piece.slice(index + 1).trim());
  }
  return cookies;
}
const setCookie = (reply, value, maxAge) => reply.header('Set-Cookie', `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}`);
function allowMutation(request, reply) {
  const origin = request.headers.origin;
  if (!ORIGINS.has(origin) || request.headers['x-lga-local-client'] !== '1') {
    reply.code(403).send({ error: 'Local browser origin required.' });
    return false;
  }
  return true;
}
function failAttempt(request, reply) {
  const key = request.ip;
  const now = Date.now();
  const record = attempts.get(key);
  const n = record && record.until > now ? record.count + 1 : 1;
  attempts.set(key, { count: n, until: now + 15 * 60_000 });
  if (attempts.size > 2000) attempts.clear();
  return reply.code(401).send({ error: 'Invalid credentials.' });
}
function blocked(request, reply) {
  const record = attempts.get(request.ip);
  if (record && record.until > Date.now() && record.count >= 5) {
    reply.code(429).send({ error: 'Too many attempts; retry in 15 minutes.' });
    return true;
  }
  return false;
}
async function getAdult(request, pool) {
  const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await pool.query('SELECT a.id,a.email FROM local_sessions s JOIN local_adults a ON a.id=s.adult_id WHERE s.token_hash=$1 AND s.expires_at>NOW()', [hashToken(token)]);
  return rows[0] ?? null;
}
async function requireAdult(request, reply, pool) {
  const adult = await getAdult(request, pool);
  if (!adult) reply.code(401).send({ error: 'Sign in to use account preferences.' });
  return adult;
}
async function verifyAdultPassword(pool, adultId, password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) return false;
  const { rows } = await pool.query('SELECT salt,password_hash FROM local_adults WHERE id=$1', [adultId]);
  const row = rows[0];
  const derived = await scrypt(password, row?.salt ?? '00000000000000000000000000000000', 64);
  const expected = Buffer.from(row?.password_hash ?? '0'.repeat(128), 'hex');
  return !!row && expected.length === 64 && timingSafeEqual(derived, expected);
}
async function authorizeProfileChange(request, reply, pool) {
  if (!allowMutation(request, reply) || blocked(request, reply)) return null;
  const adult = await requireAdult(request, reply, pool);
  if (!adult) return null;
  if (!await verifyAdultPassword(pool, adult.id, request.body?.password)) {
    failAttempt(request, reply);
    return null;
  }
  attempts.delete(request.ip);
  return adult;
}
async function issueSession(reply, pool, id) {
  const token = randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO local_sessions(token_hash,adult_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`, [hashToken(token), id]);
  setCookie(reply, token, SESSION_AGE_S);
}
export function validateAlphabetSnapshot(snapshot) {
  const invalid = message => ({ valid: false, message });
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return invalid('Invalid alphabet snapshot.');
  if (Object.keys(snapshot).length !== 2 || !Object.hasOwn(snapshot,'letters') || !Object.hasOwn(snapshot,'courseComplete')) return invalid('Unexpected alphabet snapshot fields.');
  if (!Array.isArray(snapshot.letters) || snapshot.letters.length > 26 ||
      !snapshot.letters.every(x => typeof x === 'string' && /^[A-Z]$/.test(x)) ||
      new Set(snapshot.letters).size !== snapshot.letters.length) return invalid('Invalid letter list.');
  if (typeof snapshot.courseComplete !== 'boolean' || (snapshot.courseComplete && snapshot.letters.length !== 26)) return invalid('Invalid completion state.');
  return { valid: true, snapshot: { letters: [...snapshot.letters].sort(), courseComplete: snapshot.courseComplete } };
}

// Only preserve allow-listed completion/counter fields from legacy games.
// No arbitrary localStorage keys, identifiers, names, free-form content or child data.
export function validateLegacyGameSnapshot(snapshot) {
  const invalid = message => ({ valid: false, message });
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      Object.keys(snapshot).sort().join(',') !== 'lost,picture,quests') return invalid('Invalid legacy progress fields.');
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const list = value => Array.isArray(value) && value.length <= 26 &&
    value.every(x => typeof x === 'string' && /^[A-Z]$/.test(x)) &&
    new Set(value).size === value.length;
  const { lost, picture, quests } = snapshot;
  if (!lost || typeof lost !== 'object' || Array.isArray(lost) ||
      Object.keys(lost).sort().join(',') !== 'completed,current' ||
      !Number.isInteger(lost.current) || lost.current < 0 || lost.current > 25 || !list(lost.completed))
    return invalid('Invalid Lost Letters progress.');
  if (!picture || typeof picture !== 'object' || Array.isArray(picture) ||
      Object.keys(picture).sort().join(',') !== 'last,letters' ||
      !(picture.last === null || (typeof picture.last === 'string' && /^[A-Z]$/.test(picture.last))) ||
      !picture.letters || typeof picture.letters !== 'object' || Array.isArray(picture.letters) ||
      Object.keys(picture.letters).some(k => !letters.includes(k) || k.length !== 1))
    return invalid('Invalid Picture Rescue progress.');
  for (const item of Object.values(picture.letters)) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'success,wrong' ||
        !Number.isInteger(item.success) || item.success < 0 || item.success > 10000 ||
        !Number.isInteger(item.wrong) || item.wrong < 0 || item.wrong > 10000)
      return invalid('Invalid picture attempt counters.');
  }
  if (!quests || typeof quests !== 'object' || Array.isArray(quests) ||
      Object.keys(quests).sort().join(',') !== 'completed' ||
      !Array.isArray(quests.completed) || quests.completed.length > 3 ||
      new Set(quests.completed).size !== quests.completed.length ||
      quests.completed.some(k => !['forest','space','ocean'].includes(k)))
    return invalid('Invalid Story Quests progress.');
  return { valid: true, snapshot: {
    lost: { current: lost.current, completed: [...lost.completed].sort() },
    picture: { last: picture.last, letters: picture.letters },
    quests: { completed: [...quests.completed].sort() }
  } };
}

export function registerLocalRoutes(app, pool) {
  app.post('/api/auth/register', async (request, reply) => {
    if (!allowMutation(request, reply) || blocked(request, reply)) return;
    const email = encodeEmail(request.body?.email), password = request.body?.password;
    if (!validEmail(email) || !validPassword(password)) return reply.code(400).send({ error: 'Enter a valid email and a password of 12–200 characters.' });
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)).toString('hex');
    const id = randomUUID();
    try {
      await pool.query('INSERT INTO local_adults(id,email,salt,password_hash) VALUES($1,$2,$3,$4)', [id,email,salt,derived]);
    } catch (error) {
      if (error.code === '23505') return reply.code(409).send({ error: 'Account already exists. Please sign in.' });
      throw error;
    }
    await issueSession(reply, pool, id);
    attempts.delete(request.ip);
    return { ok: true, adult: { id, email } };
  });
  app.post('/api/auth/login', async (request, reply) => {
    if (!allowMutation(request, reply) || blocked(request, reply)) return;
    const email = encodeEmail(request.body?.email), password = request.body?.password;
    if (!validEmail(email) || typeof password !== 'string' || password.length > 200) return failAttempt(request, reply);
    const { rows } = await pool.query('SELECT id,email,salt,password_hash FROM local_adults WHERE email=$1', [email]);
    // Always perform expensive key derivation, even for nonexistent email, to limit account enumeration.
    const row = rows[0];
    const derived = await scrypt(password, row?.salt ?? '00000000000000000000000000000000', 64);
    const expected = Buffer.from(row?.password_hash ?? '0'.repeat(128), 'hex');
    if (!row || expected.length !== 64 || !timingSafeEqual(derived, expected)) return failAttempt(request, reply);
    await issueSession(reply, pool, row.id);
    attempts.delete(request.ip);
    return { ok: true, adult: { id: row.id, email: row.email } };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    if (!allowMutation(request, reply)) return;
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (token) await pool.query('DELETE FROM local_sessions WHERE token_hash=$1', [hashToken(token)]);
    setCookie(reply, '', 0);
    return { ok: true };
  });
  app.get('/api/auth/me', async request => {
    const adult = await getAdult(request, pool);
    return { adult: adult ? { id: adult.id, email: adult.email } : null };
  });
  // Protect every profile read/write with session AND password re-confirmation.
  app.post('/api/profile/load', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const { rows } = await pool.query('SELECT profile FROM local_aics_profiles WHERE adult_id=$1', [adult.id]);
    return { profile: rows[0]?.profile ?? null };
  });
  // Local draft-practice results. Password re-confirmation is required for EACH read/write.
  // Derive adult_id from the verified session, never from request JSON.
  app.post('/api/practice/load', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const { rows } = await pool.query(
      'SELECT game_id, best_score, last_score, attempts FROM local_practice_results WHERE adult_id=$1 ORDER BY game_id',
      [adult.id]);
    return { results: rows.map(row => ({ gameId: row.game_id, bestScore: row.best_score,
      lastScore: row.last_score, attempts: row.attempts })) };
  });
  app.post('/api/practice/complete', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const { gameId, score, total } = request.body ?? {};
    if (!['sorting', 'patterns', 'measurement', 'nature'].includes(gameId)
      || total !== 4 || !Number.isInteger(score) || score < 0 || score > 4) {
      return reply.code(400).send({ error: 'Invalid draft practice result.' });
    }
    // An adult-confirmed completion, NOT a proof of the child's answers or curriculum mastery.
    const { rows } = await pool.query(`INSERT INTO local_practice_results
      (adult_id,game_id,best_score,last_score,attempts)
      VALUES ($1,$2,$3,$3,1)
      ON CONFLICT (adult_id,game_id) DO UPDATE SET
      best_score=GREATEST(local_practice_results.best_score, EXCLUDED.best_score),
      last_score=EXCLUDED.last_score,
      attempts=local_practice_results.attempts+1, completed_at=NOW()
      RETURNING game_id,best_score,last_score,attempts`, [adult.id, gameId, score]);
    const row = rows[0];
    return { ok: true, result: { gameId: row.game_id, bestScore: row.best_score,
      lastScore: row.last_score, attempts: row.attempts } };
  });
  // Adult-confirmed, opt-in original ABC progress snapshot (not automatic child tracking).
  // Adult id MUST come from the validated session; never trust an ID sent by the client.
  app.post('/api/alphabet/load', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const { rows } = await pool.query(
      'SELECT letters,course_complete FROM local_alphabet_snapshots WHERE adult_id=$1', [adult.id]);
    const row = rows[0];
    return { snapshot: row ? { letters: row.letters, courseComplete: row.course_complete } : null };
  });
  app.put('/api/alphabet/save', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const result = validateAlphabetSnapshot(request.body?.snapshot);
    if (!result.valid) return reply.code(400).send({ error: result.message });
    await pool.query(`INSERT INTO local_alphabet_snapshots(adult_id,letters,course_complete)
      VALUES ($1,$2::jsonb,$3)
      ON CONFLICT(adult_id) DO UPDATE SET letters=EXCLUDED.letters,
      course_complete=EXCLUDED.course_complete, updated_at=NOW()`,
      [adult.id, JSON.stringify(result.snapshot.letters), result.snapshot.courseComplete]);
    return { ok: true, count: result.snapshot.letters.length };
  });
  // A manual adult-confirmed snapshot of three original device-local games.
  app.post('/api/legacy/load', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const { rows } = await pool.query(
      'SELECT snapshot FROM local_legacy_game_snapshots WHERE adult_id=$1', [adult.id]);
    return { legacySnapshot: rows[0]?.snapshot ?? null };
  });
  app.put('/api/legacy/save', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const result = validateLegacyGameSnapshot(request.body?.snapshot);
    if (!result.valid) return reply.code(400).send({ error: result.message });
    await pool.query(`INSERT INTO local_legacy_game_snapshots(adult_id,snapshot)
      VALUES ($1,$2::jsonb) ON CONFLICT(adult_id) DO UPDATE SET
      snapshot=EXCLUDED.snapshot,updated_at=NOW()`, [adult.id, JSON.stringify(result.snapshot)]);
    return { ok: true };
  });
  app.put('/api/profile', async (request, reply) => {
    const adult = await authorizeProfileChange(request, reply, pool);
    if (!adult) return;
    const profile = request.body?.profile;
    const validation = validateLocalProfile(profile);
    if (!validation.valid) return reply.code(400).send({ error: validation.message });
    await pool.query(`INSERT INTO local_aics_profiles(adult_id,profile) VALUES($1,$2::jsonb)
      ON CONFLICT(adult_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=NOW()`, [adult.id, JSON.stringify(profile)]);
    return { ok: true };
  });
}
