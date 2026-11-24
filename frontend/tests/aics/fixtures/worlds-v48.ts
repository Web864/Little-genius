// Mirrors the Learning Library data in the live app (src/learningApp.ts, library(), v48 1795335593236).
// Tile art is shortened; only the structure and tab ids matter here.
export const V48_GROUPS = [
  ['english', 'English Adventures', [['lost', '🌳', 'Lost Letters', 'Rescue letters through picture clues'], ['game', '🔤', 'ABC Lessons', 'Capital, small, speaking and drawing'], ['phonics', '🎵', 'Sound Forest', 'Hear the first sounds'], ['words', '🧩', 'Word Builder', 'Build short words'], ['draw', '✏️', 'Drawing Studio', 'Trace & draw letters']]],
  ['math', 'Math & Thinking', [['numbers', '🔢', 'Number Galaxy', 'Learn numbers 1–10'], ['addition', '🌼', 'Addition Garden', 'Combine groups and count'], ['shapes', '🔺', 'Shape Lab', 'Explore everyday shapes']]],
  ['stories', 'Stories & Discovery', [['quest', '🗺️', 'Story Adventure', 'Help friends in little quests'], ['stories', '📚', 'Story Village', 'Hear stories & answer questions'], ['poems', '🎵', 'Poems', 'Listen and read along'], ['daily', '🌈', 'Daily Discovery', 'A short guided routine'], ['review', '🧠', 'Memory Mission', 'Revisit difficult items']]],
  ['urdu', 'Urdu Garden', [['urdu', '🌷', 'Urdu Letters', 'Identify and practise Urdu letters']]],
] as const;

export const V48_TILES = [
  ['game', '<span aria-hidden=\"true\">Aa</span>', 'Letters'],
  ['numbers', '<span aria-hidden=\"true\">123</span>', 'Numbers'],
  ['shapes', '<svg aria-hidden=\"true\"></svg>', 'Shapes'],
  ['stories', '<svg aria-hidden=\"true\"></svg>', 'Stories'],
  ['urdu', '<span class=\"lga-world-urdu\" lang=\"ur\" dir=\"rtl\" aria-hidden=\"true\">اردو</span>', 'Urdu'],
  ['draw', '<svg aria-hidden=\"true\"></svg>', 'Draw'],
] as const;

// Tabs that render() in the live app can show (learningApp.ts line 186).
export const V48_TABS = ['home', 'library', 'game', 'numbers', 'addition', 'quest', 'lost', 'phonics', 'urdu', 'words', 'shapes', 'stories', 'review', 'daily', 'draw', 'poems', 'parent'] as const;
