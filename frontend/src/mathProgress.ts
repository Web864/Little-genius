export type MathGame = 'numbers' | 'addition';

const STORAGE_KEY = 'lga_math_game_progress_v1';

type MathProgress = {
  numbers: number[];
  addition: number[];
};

function cleanLevels(value: unknown, max: number): number[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value.filter((x): x is number =>
      typeof x === 'number' &&
      Number.isInteger(x) &&
      x >= 1 &&
      x <= max
    )
  )].sort((a, b) => a - b);
}

export function readMathProgress(): MathProgress {
  const empty: MathProgress = { numbers: [], addition: [] };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;

    const value: unknown = JSON.parse(raw);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return empty;
    }

    const data = value as Record<string, unknown>;

    return {
      numbers: cleanLevels(data.numbers, 10),
      addition: cleanLevels(data.addition, 7)
    };
  } catch {
    return empty;
  }
}

export function recordMathCompletion(
  game: MathGame,
  level: number
): void {
  const max = game === 'numbers' ? 10 : 7;

  if (!Number.isInteger(level) || level < 1 || level > max) {
    return;
  }

  try {
    const progress = readMathProgress();

    progress[game] = cleanLevels(
      [...progress[game], level],
      max
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(progress)
    );
  } catch {
    // A blocked or unavailable browser store must not crash a game.
  }
}
