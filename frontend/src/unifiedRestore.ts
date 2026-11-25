export const RESTORE_PROGRESS_KEYS = [
  'littleGeniusProgress',
  'littleGeniusCourseComplete',
  'littleGeniusLostLettersV1',
  'littleGeniusPictureRescue',
  'littleGeniusAdventureQuests',
  'littleGeniusConnectedCurriculum',
  'lga_math_game_progress_v1'
] as const;

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RestoreResult =
  | 'restored'
  | 'unavailable'
  | 'recovered'
  | 'recovery-failed';

export function runRestoreWithRecovery(
  storage: ProgressStorage | null,
  restore: () => boolean
): RestoreResult {
  if (!storage) return 'unavailable';

  let original: Array<readonly [string, string | null]>;

  try {
    original = RESTORE_PROGRESS_KEYS.map(
      key => [key, storage.getItem(key)] as const
    );
  } catch {
    return 'unavailable';
  }

  try {
    if (restore()) return 'restored';
  } catch {
    // Restore exceptions enter the same recovery path.
  }

  let recovered = true;

  for (const [key, value] of original) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      recovered = false;
    }
  }

  for (const [key, value] of original) {
    try {
      if (storage.getItem(key) !== value) recovered = false;
    } catch {
      recovered = false;
    }
  }

  return recovered ? 'recovered' : 'recovery-failed';
}