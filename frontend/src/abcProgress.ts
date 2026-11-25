export const ALPHABET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function alphabetLettersPractised(progress: unknown): number {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return 0;

  const values = progress as Record<string, unknown>;
  return ALPHABET_LETTERS.filter(letter => values[letter] === true).length;
}

export function isAlphabetCourseComplete(progress: unknown): boolean {
  return alphabetLettersPractised(progress) === ALPHABET_LETTERS.length;
}
