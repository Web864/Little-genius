import type { Activity, AgeBand } from './types.ts';

const ALL: AgeBand[] = ['A3', 'A4', 'A5'];
const A4A5: AgeBand[] = ['A4', 'A5'];

// Wraps the activities that exist today. No screen is changed; this is a catalogue only.
// Competency links are Draft until an educator checks them.
export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'act.lit.abc', name: 'ABC Lessons (A–Z)', domainIds: ['lit', 'phy'],
    competencyIds: ['cmp.lit.letters.1', 'cmp.lit.writing.1', 'cmp.phy.fine.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusProgress',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.lit.sounds', name: 'Sound Forest (10 beginning sounds)', domainIds: ['lit', 'lang'],
    competencyIds: ['cmp.lit.phonics.1', 'cmp.lit.letters.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusConnectedCurriculum',
    contentStatus: 'existing', reviewNote: 'Words use US English (Tap/faucet test case).',
  },
  {
    id: 'act.lit.words', name: 'Word Builder (8 CVC words)', domainIds: ['lit'],
    competencyIds: ['cmp.lit.reading.1'],
    ageBands: A4A5, languages: ['en'], digital: true, legacyKey: 'littleGeniusConnectedCurriculum',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.lit.urdu-letters', name: 'Urdu Garden (39 letters)', domainIds: ['lit'],
    competencyIds: ['cmp.lit.letters.2', 'cmp.lit.phonics.1'],
    ageBands: ALL, languages: ['ur'], digital: true, legacyKey: 'littleGeniusConnectedCurriculum',
    contentStatus: 'draft',
    reviewNote: 'Native-educator review required: abstract words, placeholder entries, Tiger/Lion both شیر, missing آ.',
  },
  {
    id: 'act.spa.shapes', name: 'Shape Lab (5 shapes)', domainIds: ['spa'],
    competencyIds: ['cmp.spa.shape.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusConnectedCurriculum',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.lang.stories', name: 'Story Village (3 stories)', domainIds: ['lang'],
    competencyIds: ['cmp.lang.stories.1', 'cmp.lang.listening.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusConnectedCurriculum',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.lang.poems', name: 'Poems (4 original poems)', domainIds: ['lang', 'art'],
    competencyIds: ['cmp.lang.listening.1', 'cmp.art.music.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'existing', reviewNote: 'No saved progress today.',
  },
  {
    id: 'act.num.numbers', name: 'Number Galaxy (1–10)', domainIds: ['num'],
    competencyIds: ['cmp.num.counting.1', 'cmp.num.recognition.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'existing', reviewNote: 'No saved progress today.',
  },
  {
    id: 'act.num.addition', name: 'Addition (8 object questions)', domainIds: ['num'],
    competencyIds: ['cmp.num.operations.1'],
    ageBands: A4A5, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'existing', reviewNote: 'No saved progress today.',
  },
  {
    id: 'act.pat.quests', name: 'Adventure Quests (3 quests)', domainIds: ['pat'],
    competencyIds: ['cmp.pat.logic.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusAdventureQuests',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.lit.lost-letters', name: 'Lost Letters Rescue', domainIds: ['lit'],
    competencyIds: ['cmp.lit.letters.1', 'cmp.lit.phonics.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusLostLettersV1',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.lit.picture-rescue', name: 'Picture Rescue (forest)', domainIds: ['lit'],
    competencyIds: ['cmp.lit.phonics.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: 'littleGeniusPictureRescue',
    contentStatus: 'existing', reviewNote: '',
  },
  {
    id: 'act.art.draw', name: 'Drawing', domainIds: ['art', 'phy'],
    competencyIds: ['cmp.art.draw.1', 'cmp.phy.fine.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'existing', reviewNote: 'No saved progress today.',
  },
  {
    id: 'act.spa.sorting-draft', name: 'Sorting Safari (Draft)', domainIds: ['spa', 'pat'],
    competencyIds: ['cmp.spa.shape.1', 'cmp.pat.logic.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'draft', reviewNote: 'New practice game; country mapping and content require educator review.',
  },
  {
    id: 'act.pat.patterns-draft', name: 'Pattern Parade (Draft)', domainIds: ['pat', 'num'],
    competencyIds: ['cmp.pat.logic.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'draft', reviewNote: 'New practice game; country mapping and content require educator review.',
  },
  {
    id: 'act.apl.memory-mission', name: 'Memory Mission (spaced review)', domainIds: ['apl'],
    competencyIds: ['cmp.apl.persistence.1'],
    ageBands: ALL, languages: ['en', 'ur'], digital: true, legacyKey: 'littleGeniusConnectedCurriculum',
    contentStatus: 'draft', reviewNote: 'Reuses curriculum records; no separate store. Draft because review items include unreviewed Urdu letters.',
  },
  {
    id: 'act.dig.daily-discovery', name: 'Daily Discovery (4 steps incl. offline)', domainIds: ['dig', 'apl'],
    competencyIds: ['cmp.dig.wellbeing.1'],
    ageBands: ALL, languages: ['en'], digital: true, legacyKey: null,
    contentStatus: 'existing', reviewNote: 'Daily state is date-scoped and not migrated.',
  },
];

export const getActivity = (id: string): Activity | undefined => ACTIVITIES.find((a) => a.id === id);
