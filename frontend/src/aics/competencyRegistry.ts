import type { Competency, Domain } from './types.ts';

// International Core: 14 domains. IDs are stable and must never be renumbered.
// Domain wording must be reconciled with the master prompt before Phase 3 (owner-approved rule).
export const DOMAINS: readonly Domain[] = [
  { id: 'lang', code: 'LANG', name: 'Language & Communication', optionalModule: false },
  { id: 'lit', code: 'LIT', name: 'Early Literacy', optionalModule: false },
  { id: 'num', code: 'NUM', name: 'Number & Counting', optionalModule: false },
  { id: 'spa', code: 'SPA', name: 'Shape, Space & Measure', optionalModule: false },
  { id: 'pat', code: 'PAT', name: 'Patterns, Sorting & Logic', optionalModule: false },
  { id: 'sci', code: 'SCI', name: 'Understanding the World', optionalModule: false },
  { id: 'sel', code: 'SEL', name: 'Social & Emotional', optionalModule: false },
  { id: 'phy', code: 'PHY', name: 'Physical Development', optionalModule: false },
  { id: 'hlt', code: 'HLT', name: 'Health, Safety & Self-care', optionalModule: false },
  { id: 'art', code: 'ART', name: 'Creative Arts', optionalModule: false },
  { id: 'cul', code: 'CUL', name: 'Culture & Community', optionalModule: false },
  { id: 'apl', code: 'APL', name: 'Approaches to Learning', optionalModule: false },
  { id: 'val', code: 'VAL', name: 'Values & Faith (optional module)', optionalModule: true },
  { id: 'dig', code: 'DIG', name: 'Digital Wellbeing', optionalModule: false },
];

const c = (id: string, title: string): Competency => {
  const [, domain, strand] = id.split('.');
  return { id, domain, strand, title, status: 'draft', reviewer: null };
};

// All competencies are Draft: they are our own framework and have not been reviewed by an educator.
export const COMPETENCIES: readonly Competency[] = [
  c('cmp.lang.listening.1', 'Listens and responds to simple spoken instructions'),
  c('cmp.lang.speaking.1', 'Names familiar objects and uses new words'),
  c('cmp.lang.stories.1', 'Follows a short story and answers a simple question about it'),

  c('cmp.lit.phonics.1', 'Hears and matches the beginning sound of a word'),
  c('cmp.lit.letters.1', 'Recognises and names letters of the Latin alphabet'),
  c('cmp.lit.letters.2', 'Recognises letters of a home-language script (for example Urdu)'),
  c('cmp.lit.reading.1', 'Blends sounds to read simple three-letter words'),
  c('cmp.lit.writing.1', 'Traces and forms letter shapes'),

  c('cmp.num.counting.1', 'Counts objects up to 10'),
  c('cmp.num.recognition.1', 'Recognises numerals up to 10'),
  c('cmp.num.operations.1', 'Combines small groups of objects (adds within 10)'),

  c('cmp.spa.shape.1', 'Recognises and names basic 2D shapes'),
  c('cmp.spa.measure.1', 'Compares size, length and quantity'),
  c('cmp.spa.position.1', 'Uses simple position words'),

  c('cmp.pat.sorting.1', 'Sorts objects by one attribute'),
  c('cmp.pat.pattern.1', 'Continues a simple repeating pattern'),
  c('cmp.pat.logic.1', 'Solves simple problems with adult support'),

  c('cmp.sci.living.1', 'Names plants and animals and what they need'),
  c('cmp.sci.weather.1', 'Talks about weather and seasons'),
  c('cmp.sci.senses.1', 'Uses the senses to explore the world'),
  c('cmp.sci.materials.1', 'Describes everyday materials'),

  c('cmp.sel.emotions.1', 'Names basic feelings'),
  c('cmp.sel.social.1', 'Shares and takes turns'),
  c('cmp.sel.regulation.1', 'Uses simple calming strategies with an adult'),

  c('cmp.phy.gross.1', 'Moves with balance and coordination (adult-led, offline)'),
  c('cmp.phy.fine.1', 'Controls finger and hand movements for tracing and drawing'),

  c('cmp.hlt.hygiene.1', 'Follows simple hygiene routines such as handwashing'),
  c('cmp.hlt.safety.1', 'Knows basic safety rules with an adult'),
  c('cmp.hlt.selfcare.1', 'Looks after own belongings and tidies up'),

  c('cmp.art.draw.1', 'Draws and uses colour to express ideas'),
  c('cmp.art.music.1', 'Joins in with rhymes, songs and rhythm'),
  c('cmp.art.drama.1', 'Takes part in role play'),

  c('cmp.cul.family.1', 'Talks about family and community helpers'),
  c('cmp.cul.celebrations.1', 'Talks about celebrations in a neutral, respectful way'),

  c('cmp.apl.curiosity.1', 'Shows curiosity and asks questions'),
  c('cmp.apl.persistence.1', 'Keeps trying after a mistake'),

  c('cmp.val.values.1', 'Adult-selected values and faith content (optional module)'),

  c('cmp.dig.wellbeing.1', 'Uses devices with an adult and takes breaks'),
];

export const domainIds = (): string[] => DOMAINS.map((d) => d.id);
export const competencyIds = (): string[] => COMPETENCIES.map((x) => x.id);
export const getCompetency = (id: string): Competency | undefined =>
  COMPETENCIES.find((x) => x.id === id);
