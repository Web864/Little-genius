/** Milestone 3.2 — Draft preschool practice games; not an approved syllabus. */
export type ThinkingGame = 'sorting' | 'patterns' | 'measurement' | 'nature';
export const THINKING_GAME_IDS: readonly ThinkingGame[] = ['sorting', 'patterns', 'measurement', 'nature'];
export const isThinkingGame = (value: string): value is ThinkingGame =>
  THINKING_GAME_IDS.some(game => game === value);
export interface Round { prompt: string; choices: readonly string[]; answer: string; explanation: string; }
export const SORTING_ROUNDS: readonly Round[] = [
  { prompt: 'Which one is a fruit?', choices: ['🍎 Apple', '🚗 Car', '🪑 Chair'], answer: '🍎 Apple', explanation: 'An apple is a fruit.' },
  { prompt: 'Which one has the same shape as a ball?', choices: ['📕 Book', '⚽ Ball', '📦 Box'], answer: '⚽ Ball', explanation: 'The ball is round.' },
  { prompt: 'Which one is an animal?', choices: ['🌻 Flower', '🐱 Cat', '🚲 Bicycle'], answer: '🐱 Cat', explanation: 'A cat is an animal.' },
  { prompt: 'Which one is used to write?', choices: ['✏️ Pencil', '🍌 Banana', '🧸 Teddy'], answer: '✏️ Pencil', explanation: 'A pencil is used for writing.' },
];
export const PATTERN_ROUNDS: readonly Round[] = [
  { prompt: 'Continue the pattern: 🔴 🔵 🔴 🔵 ?', choices: ['🔵', '🔴', '🟡'], answer: '🔴', explanation: 'Red and blue alternate.' },
  { prompt: 'What comes next? ⭐ ⭐ 🌙 ⭐ ⭐ 🌙 ?', choices: ['🌙', '⭐', '☀️'], answer: '⭐', explanation: 'Two stars, then a moon, repeat.' },
  { prompt: 'Continue: 🟩 🟨 🟩 🟨 ?', choices: ['🟩', '🟨', '🟥'], answer: '🟩', explanation: 'Green and yellow alternate.' },
  { prompt: 'What comes next? 🍎 🍎 🍌 🍎 🍎 🍌 ?', choices: ['🍌', '🍎', '🍐'], answer: '🍎', explanation: 'Two apples and a banana repeat.' },
];
/** Draft practice questions. Weight comparisons are described, not inferred from emoji size. */
export const MEASUREMENT_ROUNDS: readonly Round[] = [
  { prompt: 'Which animal is usually bigger?', choices: ['🐘 Elephant', '🐭 Mouse', '🐜 Ant'], answer: '🐘 Elephant', explanation: 'An elephant is much bigger than a mouse or an ant.' },
  { prompt: 'Which object is usually longer?', choices: ['✏️ Pencil', '🚌 Bus', '🧷 Paper clip'], answer: '🚌 Bus', explanation: 'A bus is longer than a pencil or a paper clip.' },
  { prompt: 'Which object is usually heavier?', choices: ['🪨 Large rock', '🪶 Feather', '🍃 Leaf'], answer: '🪨 Large rock', explanation: 'A large rock usually weighs more than a feather or leaf.' },
  { prompt: 'Which item is usually shorter?', choices: ['🌳 Tall tree', '🏢 Building', '🥄 Spoon'], answer: '🥄 Spoon', explanation: 'A spoon is usually shorter than a tall tree or building.' },
];
/** Nature facts are general observations, not national curriculum approvals. */
export const NATURE_ROUNDS: readonly Round[] = [
  { prompt: 'What does a plant need to grow?', choices: ['💧 Water', '🧱 Bricks', '🧸 Toys'], answer: '💧 Water', explanation: 'Plants need water, light and air to grow.' },
  { prompt: 'Which animal usually lives in water?', choices: ['🐟 Fish', '🐱 Cat', '🐐 Goat'], answer: '🐟 Fish', explanation: 'Fish live in water and breathe through gills.' },
  { prompt: 'What do bees help flowers do?', choices: ['🌼 Pollinate', '🚗 Drive', '🛏️ Sleep'], answer: '🌼 Pollinate', explanation: 'Bees can carry pollen from one flower to another.' },
  { prompt: 'Which choice helps keep a park clean?', choices: ['🗑️ Put litter in a bin', '🥤 Drop bottles', '🧻 Leave paper on grass'], answer: '🗑️ Put litter in a bin', explanation: 'Putting rubbish in a bin helps protect our environment.' },
];
export const roundsFor = (game: ThinkingGame): readonly Round[] => {
  switch (game) {
    case 'sorting': return SORTING_ROUNDS;
    case 'patterns': return PATTERN_ROUNDS;
    case 'measurement': return MEASUREMENT_ROUNDS;
    case 'nature': return NATURE_ROUNDS;
  }
};
export const correctChoice = (game: ThinkingGame, roundIndex: number, choice: string): boolean =>
  roundsFor(game)[roundIndex]?.answer === choice;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] || ch));
export function renderThinkingGame(game: ThinkingGame, roundIndex: number, score: number, message: string, finished: boolean): string {
  const title = { sorting: 'Sorting Safari', patterns: 'Pattern Parade', measurement: 'Measurement Mission', nature: 'Nature Discovery' }[game];
  const rounds = roundsFor(game);
  const round = rounds[Math.min(roundIndex, rounds.length-1)];
  return `<main class="lga-thinking"><span class="kid-eyebrow">New • Draft practice • Not curriculum-approved</span>
    <h1>${title}</h1><p>Look, think and choose. Take your time!</p>
    <p class="lga-thinking-score" role="status">${finished ? 'Finished' : `Question ${roundIndex+1} of ${rounds.length}`} · Stars ${score}/${rounds.length}</p>
    ${finished ? `<h2>🌟 Great exploring!</h2><p>You found ${score} out of ${rounds.length}. Try again or visit the Learning Library.</p>
      <button class="lga-thinking-action" data-thinking-restart="${game}">Play again</button>` : `
      <section class="lga-thinking-board" aria-label="${title} question"><h2>${escapeHtml(round.prompt)}</h2>
      <div class="lga-thinking-answers">${round.choices.map((c,i)=>`<button type="button" data-thinking-choice="${i}" ${message?'disabled':''}>${escapeHtml(c)}</button>`).join('')}</div>
      <p class="lga-thinking-message" role="status" aria-live="polite">${escapeHtml(message)}</p>
      ${message ? `<button class="lga-thinking-action" data-thinking-next="1">${roundIndex===rounds.length-1?'See my stars':'Next question →'}</button>`:''}
      </section>`}
    <p class="lga-thinking-note">Draft learning activity. Your answers stay in this round. A grown-up can optionally save the finished score to a local test account after password confirmation.</p>
    <button type="button" data-tab="library" class="lga-thinking-back">← Learning Library</button>
  </main>`;
}
