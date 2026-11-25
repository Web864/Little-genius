const LIMITS = Object.freeze({
  phonics: 10,
  urdu: 39,
  words: 8,
  shapes: 5
});

const fail = message => ({ valid: false, message });

const isObject = value =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value);

const hasKeys = (value, expected) =>
  isObject(value) &&
  Object.keys(value).sort().join(',') ===
    [...expected].sort().join(',');

function validLevels(value, max) {
  return Array.isArray(value) &&
    value.length <= max &&
    value.every(n =>
      Number.isInteger(n) &&
      n >= 1 &&
      n <= max
    ) &&
    new Set(value).size === value.length;
}

function validDate(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const timestamp = Date.parse(value + 'T00:00:00Z');

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validRecord(record) {
  if (!hasKeys(record, ['ok', 'wrong', 'tries', 'due'])) {
    return false;
  }

  for (const field of ['ok', 'wrong', 'tries']) {
    const n = record[field];

    if (!Number.isInteger(n) || n < 0 || n > 1000000) {
      return false;
    }
  }

  return validDate(record.due);
}

function validRecordKey(key) {
  const match = /^(phonics|urdu|words|shapes):(\d+)$/.exec(key);

  if (!match) return false;

  const index = Number(match[2]);

  return Number.isInteger(index) &&
    index >= 0 &&
    index < LIMITS[match[1]];
}

export function validateSixGameSnapshot(snapshot) {
  if (!hasKeys(snapshot, ['version', 'math', 'curriculum'])) {
    return fail('Invalid six-game snapshot fields.');
  }

  if (snapshot.version !== 1) {
    return fail('Unsupported snapshot version.');
  }

  if (!hasKeys(snapshot.math, ['numbers', 'addition'])) {
    return fail('Invalid math progress fields.');
  }

  if (!validLevels(snapshot.math.numbers, 10) ||
      !validLevels(snapshot.math.addition, 7)) {
    return fail('Invalid math level progress.');
  }

  if (!hasKeys(snapshot.curriculum, ['records']) ||
      !isObject(snapshot.curriculum.records)) {
    return fail('Invalid curriculum progress.');
  }

  const records = Object.entries(snapshot.curriculum.records);

  if (records.length > 62) {
    return fail('Too many curriculum records.');
  }

  for (const [key, record] of records) {
    if (!validRecordKey(key) || !validRecord(record)) {
      return fail('Invalid curriculum record.');
    }
  }

  const cleanRecords = Object.fromEntries(
    records.map(([key, record]) => [
      key,
      {
        ok: record.ok,
        wrong: record.wrong,
        tries: record.tries,
        due: record.due
      }
    ])
  );

  return {
    valid: true,
    snapshot: {
      version: 1,
      math: {
        numbers: [...snapshot.math.numbers].sort((a, b) => a - b),
        addition: [...snapshot.math.addition].sort((a, b) => a - b)
      },
      curriculum: {
        records: cleanRecords
      }
    }
  };
}
