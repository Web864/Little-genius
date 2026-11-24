import { ACTIVITIES } from './activityRegistry.ts';
import { COMPETENCIES } from './competencyRegistry.ts';
import type { AgeBand, Mapping, MappingLevel } from './types.ts';

const ALL: AgeBand[] = ['A3', 'A4', 'A5'];
const A4: AgeBand[] = ['A4'];

const overlaps = (a: readonly AgeBand[], b: readonly AgeBand[]): boolean => a.some((x) => b.includes(x));
const domainsOf = (competencyIds: string[]): string[] => [...new Set(competencyIds.map((c) => c.split('.')[1]))];

/** Activities that share a competency with the row and an age band. Derived, so it cannot drift from the registries. */
export const activitiesFor = (competencyIds: readonly string[], ageBands: readonly AgeBand[]): string[] =>
  ACTIVITIES.filter((a) => a.competencyIds.some((c) => competencyIds.includes(c)) && overlaps(a.ageBands, ageBands)).map((a) => a.id);

// Every row is Draft with no reviewer. Notes are our own paraphrase, never official wording.
function row(
  id: string, level: MappingLevel, frameworkId: string, sourceRef: string, officialOutcomeRef: string | null,
  ageBands: AgeBand[], competencyIds: string[], note: string, activityIds?: string[],
): Mapping {
  return {
    id, level, frameworkId, sourceRef, officialOutcomeRef, ageBands,
    domainIds: domainsOf(competencyIds), competencyIds,
    activityIds: activityIds ?? activitiesFor(competencyIds, ageBands),
    status: 'draft', reviewer: null, note,
  };
}

// ---- International Core: one internal row per competency (our own framework, never official) ----
const INTL: Mapping[] = COMPETENCIES.map((c) =>
  row('map.intl.' + c.id.slice(4), 'internal', 'intl-core', c.title, null, ALL, [c.id], 'Internal competency; not an official outcome.'));

// ---- England EYFS: the 17 Early Learning Goals. Reception is age 4–5 and the goals are assessed at the end of Reception,
// so they map to band A4 (4–5). They are not Year 1 (A5) content. ----
const EYFS_SRC = 'EYFS statutory framework for group and school-based providers (from Sep 2026)';
const eyfs = (slug: string, area: string, goal: string, pages: string, cmps: string[], note: string): Mapping =>
  row('map.eyfs.' + slug, 'outcome', 'eyfs-2026', EYFS_SRC + ', ' + area + ', pp. ' + pages, 'EYFS ELG: ' + goal, A4, cmps, note);
const EYFS: Mapping[] = [
  eyfs('cl-listening', 'Communication and Language', 'Listening, Attention and Understanding', '12–13', ['cmp.lang.listening.1', 'cmp.lang.stories.1'], 'Attending, following instructions, answering questions.'),
  eyfs('cl-speaking', 'Communication and Language', 'Speaking', '12–13', ['cmp.lang.speaking.1'], 'Expressing ideas and using new vocabulary.'),
  eyfs('psed-selfreg', 'Personal, Social and Emotional Development', 'Self-Regulation', '13', ['cmp.sel.regulation.1', 'cmp.sel.emotions.1', 'cmp.apl.persistence.1'], 'Managing feelings and behaviour. Mostly adult-led.'),
  eyfs('psed-managing', 'Personal, Social and Emotional Development', 'Managing Self', '13', ['cmp.hlt.selfcare.1', 'cmp.hlt.hygiene.1', 'cmp.apl.persistence.1'], 'Confidence, healthy routines and personal care.'),
  eyfs('psed-relationships', 'Personal, Social and Emotional Development', 'Building Relationships', '13', ['cmp.sel.social.1', 'cmp.sel.emotions.1'], 'Cooperating and forming friendships.'),
  eyfs('pd-gross', 'Physical Development', 'Gross Motor Skills', '14', ['cmp.phy.gross.1'], 'Whole-body movement. Offline only.'),
  eyfs('pd-fine', 'Physical Development', 'Fine Motor Skills', '14', ['cmp.phy.fine.1'], 'Hand control for tools and early writing.'),
  eyfs('lit-comprehension', 'Literacy', 'Comprehension', '14', ['cmp.lang.stories.1'], 'Understanding stories and rhymes read aloud.'),
  eyfs('lit-wordreading', 'Literacy', 'Word Reading', '14', ['cmp.lit.phonics.1', 'cmp.lit.letters.1', 'cmp.lit.reading.1'], 'Sounds, letters and reading simple words.'),
  eyfs('lit-writing', 'Literacy', 'Writing', '14', ['cmp.lit.writing.1', 'cmp.lit.letters.1', 'cmp.phy.fine.1'], 'Forming letters and writing simple words.'),
  eyfs('maths-number', 'Mathematics', 'Number', '15', ['cmp.num.counting.1', 'cmp.num.recognition.1', 'cmp.num.operations.1'], 'Counting and number sense. Our activities stop at 10.'),
  eyfs('maths-patterns', 'Mathematics', 'Numerical Patterns', '15', ['cmp.pat.pattern.1', 'cmp.num.operations.1'], 'Number relationships and patterns. Only partly covered.'),
  eyfs('utw-pastpresent', 'Understanding the World', 'Past and Present', '15–16', ['cmp.cul.family.1'], 'Family and community past and present. Content gap.'),
  eyfs('utw-people', 'Understanding the World', 'People, Culture and Communities', '15–16', ['cmp.cul.family.1', 'cmp.cul.celebrations.1'], 'Communities and cultures. Content gap.'),
  eyfs('utw-natural', 'Understanding the World', 'The Natural World', '15–16', ['cmp.sci.living.1', 'cmp.sci.weather.1', 'cmp.sci.senses.1'], 'Nature, seasons and the senses. Content gap.'),
  eyfs('ead-materials', 'Expressive Arts and Design', 'Creating with Materials', '16', ['cmp.art.draw.1', 'cmp.sci.materials.1'], 'Making with a range of materials. Digital drawing is partial.'),
  eyfs('ead-expressive', 'Expressive Arts and Design', 'Being Imaginative and Expressive', '16', ['cmp.art.music.1', 'cmp.art.drama.1'], 'Songs, rhymes and role play.'),
];

// ---- Pakistan SNC ECCE Pre-I (age 4–5). These are COMPETENCY-level rows. Each competency groups lettered outcomes (a, b, c...);
// the individual outcomes are not mapped and stay pending educator review. The source has no formal outcome codes. ----
const SNC_SRC = 'SNC 2020 ECCE Grade Pre-I';
const snc = (area: string, c: number, title: string, letters: string, pages: string, cmps: string[], note: string): Mapping =>
  row('map.snc.' + area.replace('.', '-') + '-c' + c, 'competency', 'snc-ecce-2020',
    SNC_SRC + ' §' + area + ', Competency ' + c + ', p. ' + pages, 'SNC ' + area + ' C' + c, A4, cmps, title + (letters ? ' Groups outcomes ' + letters + ' (not mapped individually).' : '') + (note ? ' ' + note : ''));
const SNC: Mapping[] = [
  snc('2.4', 1, 'Self-identity and decision making.', 'a–j', '21', ['cmp.sel.emotions.1', 'cmp.apl.curiosity.1'], ''),
  snc('2.4', 2, 'Cooperation and sharing.', 'a–h', '22', ['cmp.sel.social.1'], ''),
  snc('2.4', 3, 'Heritage and diversity.', 'a–g', '22–23', ['cmp.cul.celebrations.1', 'cmp.cul.family.1'], 'Local culture content is a gap.'),
  snc('2.4', 4, 'Religious values.', 'a–h', '23', ['cmp.val.values.1'], 'Adult-enabled optional module only.'),
  snc('2.4', 5, 'Responsibility.', 'a–f', '24', ['cmp.hlt.selfcare.1'], ''),
  snc('2.4', 6, 'Courtesy.', 'a–f', '25', ['cmp.sel.social.1'], ''),
  snc('2.4', 7, 'Citizenship.', 'a–e', '25', ['cmp.hlt.safety.1'], 'Rules and traffic awareness. Offline.'),
  snc('2.4', 8, 'Ethics and morals.', 'a–e', '25', ['cmp.sel.social.1', 'cmp.sel.emotions.1'], ''),
  snc('2.5', 1, 'Listening and speaking.', 'a–m', '25–26', ['cmp.lang.listening.1', 'cmp.lang.speaking.1'], ''),
  snc('2.5', 2, 'Describing objects, pictures and events.', 'a–f', '27', ['cmp.lang.speaking.1'], ''),
  snc('2.5', 3, 'Stories, rhymes and sound play.', 'a–d', '27–28', ['cmp.lang.stories.1', 'cmp.lit.phonics.1', 'cmp.art.music.1'], ''),
  snc('2.5', 4, 'Book handling and retelling.', 'a–h', '29', ['cmp.lang.stories.1'], 'Physical book handling is not digital.'),
  snc('2.5', 5, 'Book organisation and reading direction.', 'a–f', '30', ['cmp.lang.stories.1'], 'Only partly covered.'),
  snc('2.5', 6, 'Letters, names, sight words and initial sounds.', 'a–h', '30–31', ['cmp.lit.letters.1', 'cmp.lit.phonics.1'], 'Urdu script mapping needs educator review.'),
  snc('2.5', 7, 'Early writing.', 'a–n', '31–32', ['cmp.lit.writing.1', 'cmp.phy.fine.1'], ''),
  snc('2.6', 1, 'Attributes, sorting and patterns.', 'a–p', '32–34', ['cmp.pat.sorting.1', 'cmp.pat.pattern.1', 'cmp.spa.measure.1'], ''),
  snc('2.6', 2, 'Quantity and operations (counting to 50 in the source).', 'a–t', '34–35', ['cmp.num.counting.1', 'cmp.num.recognition.1', 'cmp.num.operations.1'], 'Our activities stop at 10.'),
  snc('2.6', 3, 'Shapes and position (2-D and 3-D).', 'a–e', '36', ['cmp.spa.shape.1', 'cmp.spa.position.1'], 'No 3-D shape activity.'),
  snc('2.6', 4, 'Measurement and time.', 'a–e', '37', ['cmp.spa.measure.1'], 'No measurement or time activity.'),
  snc('2.7', 1, 'Family.', 'a–d', '38', ['cmp.cul.family.1'], 'Content gap.'),
  snc('2.7', 2, 'Community.', 'a–d', '39–40', ['cmp.cul.family.1'], 'Content gap.'),
  snc('2.7', 3, 'Living and non-living things.', 'a–c', '40', ['cmp.sci.living.1'], 'Content gap.'),
  snc('2.7', 4, 'Plants and animals.', 'a–g', '41', ['cmp.sci.living.1'], 'Content gap.'),
  snc('2.7', 5, 'Weather and seasons.', 'a–e', '42', ['cmp.sci.weather.1'], 'Content gap.'),
  snc('2.7', 6, 'Caring for the environment.', '', '43', ['cmp.sci.living.1'], 'Letter range not confirmed. Content gap.'),
  snc('2.7', 7, 'Natural resources and physical features.', 'a–b', '44', ['cmp.sci.materials.1'], 'Content gap.'),
  snc('2.7', 8, 'Technology.', 'a–c', '44', ['cmp.dig.wellbeing.1'], 'Only the wellbeing aspect is covered.'),
  snc('2.8', 1, 'Movement, balance and climbing.', 'a–l', '45', ['cmp.phy.gross.1'], 'Offline only.'),
  snc('2.8', 2, 'Tools and materials with hand-eye control.', 'a–d', '46', ['cmp.phy.fine.1'], ''),
  snc('2.8', 3, 'Sensory skills.', 'a–f', '46–47', ['cmp.sci.senses.1'], 'Content gap.'),
  snc('2.9', 1, 'Healthy and hygienic living.', 'a–h', '47–48', ['cmp.hlt.hygiene.1'], 'Adult-led offline suggestions.'),
  snc('2.9', 2, 'Personal safety.', 'a–o', '48–49', ['cmp.hlt.safety.1'], 'Adult-led offline suggestions only.'),
  snc('2.10', 1, 'Drawing and colour.', 'a–g', '49–50', ['cmp.art.draw.1'], ''),
  snc('2.10', 2, 'Craft from recycled materials.', 'a–d', '50–51', ['cmp.art.draw.1'], 'Offline. Digital drawing is partial.'),
  snc('2.10', 3, 'Models and sculpture.', 'a–c', '51', ['cmp.art.draw.1'], 'Offline. Digital drawing is partial.'),
  snc('2.10', 4, 'Collage and printing.', 'a–f', '52', ['cmp.art.draw.1', 'cmp.phy.fine.1'], 'Offline. Digital drawing is partial.'),
  snc('2.10', 5, 'Folding, cutting, tearing and weaving.', 'a–d', '53', ['cmp.phy.fine.1'], 'Offline.'),
  snc('2.10', 6, 'Sound, rhythm and action.', 'a–f', '54', ['cmp.art.music.1'], ''),
  snc('2.10', 7, 'Dramatic play.', 'a–e', '55', ['cmp.art.drama.1'], 'Adult-led.'),
];

// ---- UAE MoE KG overlay: subject level only. The guide's outcome-level text is not verified. ----
const UAE_SRC = 'MoE Mandatory Subjects Guide in Private Kindergartens 2025–26 (via ADEK KG MoE Subjects Policy v1.0)';
const UAE: Mapping[] = [
  row('map.uae.arabic', 'area', 'uae-moe-kg-overlay', UAE_SRC + ': Arabic Language', null, ALL, ['cmp.lang.speaking.1', 'cmp.lit.letters.2'],
    'No Arabic content exists. Press reports 200 min/week (300 by 2027–28); ADEK states 240 min/week in Abu Dhabi. Outcomes not imported.', []),
  row('map.uae.islamic', 'area', 'uae-moe-kg-overlay', UAE_SRC + ': Islamic Studies', null, ALL, ['cmp.val.values.1'],
    'Reported as 90 min/week for Muslim children. Adult-enabled optional module only. Outcomes not imported.', []),
  row('map.uae.social', 'area', 'uae-moe-kg-overlay', UAE_SRC + ': Social Studies', null, ALL, ['cmp.cul.family.1', 'cmp.cul.celebrations.1'],
    'Reported as play-based: family, UAE geography and environment, social values. Content gap. Outcomes not imported.', []),
];

export const MAPPINGS: readonly Mapping[] = [...INTL, ...EYFS, ...SNC, ...UAE];
