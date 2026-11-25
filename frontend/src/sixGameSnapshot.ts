import { readMathProgress } from './mathProgress';

const MATH_KEY = 'lga_math_game_progress_v1';
const CURRICULUM_KEY = 'littleGeniusConnectedCurriculum';

const LIMITS: Record<string, number> = {
  phonics: 10,
  urdu: 39,
  words: 8,
  shapes: 5
};

type ResultRecord = {
  ok: number;
  wrong: number;
  tries: number;
  due: string;
};

export type SixGameSnapshot = {
  version: 1;
  math: {
    numbers: number[];
    addition: number[];
  };
  curriculum: {
    records: Record<string, ResultRecord>;
  };
};

function objectValue(x: unknown): x is Record<string, unknown> {
  return x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x);
}

function validLevels(x: unknown, max: number): x is number[] {
  return Array.isArray(x) &&
    x.length <= max &&
    x.every(n =>
      typeof n === 'number' &&
      Number.isInteger(n) &&
      n >= 1 &&
      n <= max
    ) &&
    new Set(x).size === x.length;
}

function validRecord(x: unknown): x is ResultRecord {
  if (!objectValue(x)) return false;

  if (Object.keys(x).sort().join(',') !==
      'due,ok,tries,wrong') return false;

  for (const field of ['ok', 'wrong', 'tries']) {
    const n = x[field];

    if (typeof n !== 'number' ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > 1000000) return false;
  }

  return typeof x.due === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.due) &&
    (Number.isFinite(Date.parse(x.due + 'T00:00:00Z')) && new Date(x.due + 'T00:00:00Z').toISOString().slice(0, 10) === x.due);
}

function validKey(key: string): boolean {
  const match = /^(phonics|urdu|words|shapes):(\d+)$/.exec(key);
  if (!match) return false;

  const index = Number(match[2]);

  return Number.isInteger(index) &&
    index >= 0 &&
    index < LIMITS[match[1]];
}

export function validSixGameSnapshot(
  value: unknown
): value is SixGameSnapshot {
  if (!objectValue(value)) return false;

  if (Object.keys(value).sort().join(',') !==
      'curriculum,math,version') return false;

  if (value.version !== 1 ||
      !objectValue(value.math) ||
      !objectValue(value.curriculum)) return false;

  const math = value.math;
  const curriculum = value.curriculum;

  if (Object.keys(math).sort().join(',') !==
      'addition,numbers') return false;

  if (!validLevels(math.numbers, 10) ||
      !validLevels(math.addition, 7)) return false;

  if (Object.keys(curriculum).join(',') !== 'records' ||
      !objectValue(curriculum.records)) return false;

  const records = Object.entries(curriculum.records);

  if (records.length > 62) return false;

  return records.every(([key, record]) =>
    validKey(key) && validRecord(record)
  );
}

function readObject(
  storage: Storage,
  key: string
): Record<string, unknown> {
  const raw = storage.getItem(key);

  if (raw === null) return {};

  const parsed: unknown = JSON.parse(raw);

  if (!objectValue(parsed)) {
    throw new Error('Invalid device progress data.');
  }

  return parsed;
}

export function collectSixGameSnapshot(): SixGameSnapshot | null {
  try {
    const storage = localStorage;
    const existing = readObject(storage, CURRICULUM_KEY);
    const source = existing.records;

    if (source !== undefined && !objectValue(source)) {
      return null;
    }

    const records: Record<string, ResultRecord> = {};

    for (const [key, record] of Object.entries(source ?? {})) {
      if (!validKey(key)) continue;

      if (!validRecord(record)) return null;

      records[key] = { ...record };
    }

    const math = readMathProgress();

    const snapshot: SixGameSnapshot = {
      version: 1,
      math: {
        numbers: math.numbers,
        addition: math.addition
      },
      curriculum: { records }
    };

    return validSixGameSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export function restoreSixGameSnapshot(
  snapshot: unknown
): boolean {
  if (!validSixGameSnapshot(snapshot)) return false;

  try {
    const storage = localStorage;

    const oldMath = storage.getItem(MATH_KEY);
    const oldCurriculum = storage.getItem(CURRICULUM_KEY);
    const curriculum = readObject(storage, CURRICULUM_KEY);

    if (curriculum.records !== undefined &&
        !objectValue(curriculum.records)) return false;

    const records: Record<string, unknown> = {
      ...(curriculum.records ?? {})
    };

    // Only replace progress for these four learning worlds.
    // Story Village, daily review and other data remain untouched.
    for (const key of Object.keys(records)) {
      if (validKey(key)) delete records[key];
    }

    for (const [key, record] of Object.entries(
      snapshot.curriculum.records
    )) {
      records[key] = { ...record };
    }

    const nextCurriculum = JSON.stringify({
      ...curriculum,
      records
    });

    const nextMath = JSON.stringify(snapshot.math);

    try {
      storage.setItem(CURRICULUM_KEY, nextCurriculum);
      storage.setItem(MATH_KEY, nextMath);
      return true;
    } catch {
      // Best-effort rollback for a failed browser-storage write.
      try {
        if (oldCurriculum === null) {
          storage.removeItem(CURRICULUM_KEY);
        } else {
          storage.setItem(CURRICULUM_KEY, oldCurriculum);
        }

        if (oldMath === null) {
          storage.removeItem(MATH_KEY);
        } else {
          storage.setItem(MATH_KEY, oldMath);
        }
      } catch {
        // Storage may be unavailable; the caller reports failure.
      }
      return false;
    }
  } catch {
    return false;
  }
}

export function sixGameCounts(snapshot: SixGameSnapshot) {
  const records = snapshot.curriculum.records;

  function count(world: string): number {
    return Object.entries(records).filter(([key, record]) =>
      key.startsWith(world + ':') && record.ok > 0
    ).length;
  }

  return {
    numbers: snapshot.math.numbers.length,
    addition: snapshot.math.addition.length,
    phonics: count('phonics'),
    urdu: count('urdu'),
    words: count('words'),
    shapes: count('shapes')
  };
}
