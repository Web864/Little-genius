/** Local-only practice recommendations. Draft mappings do not publish or reorder official worlds. */
import { MAPPINGS } from './aics/curriculumMappings';
import { resolveProfile } from './aics/countryRegistry';
import { readProfile, type AdultProfile } from './aics/onboardingService';
import { safeLocalStorage } from './aics/bootstrap';
import type { ThinkingGame } from './thinkingGames';

export const DRAFT_PRACTICE: ReadonlyArray<{ id: ThinkingGame; title: string; emoji: string; competencies: readonly string[] }> = [
  { id: 'sorting', title: 'Sorting Safari', emoji: '🧺', competencies: ['cmp.pat.sorting.1'] },
  { id: 'patterns', title: 'Pattern Parade', emoji: '🟩', competencies: ['cmp.pat.pattern.1'] },
  { id: 'measurement', title: 'Measurement Mission', emoji: '📏', competencies: ['cmp.spa.measure.1'] },
  { id: 'nature', title: 'Nature Discovery', emoji: '🌱', competencies: ['cmp.sci.living.1'] },
];
export type JourneyItem = { id: ThinkingGame; title: string; emoji: string; matchingDraftRows: number };
export function draftJourney(profile: AdultProfile | null): JourneyItem[] {
  if (!profile || profile.status !== 'completed') return [];
  const resolved = resolveProfile({ countryCode: profile.countryCode, frameworkId: profile.frameworkId });
  const frameworks = new Set([resolved.baseFrameworkId, ...resolved.overlayIds]);
  const ages = profile.stage === 'mixed' ? ['A3','A4','A5'] : [profile.stage];
  const rows = MAPPINGS.filter(row => frameworks.has(row.frameworkId) && row.ageBands.some(a => ages.includes(a)) && row.status === 'draft');
  return DRAFT_PRACTICE.map((item, order) => ({
    ...item, order,
    matchingDraftRows: rows.filter(row => row.competencyIds.some(id => item.competencies.includes(id))).length,
  })).sort((a,b) => b.matchingDraftRows-a.matchingDraftRows || a.order-b.order)
    .map(({id,title,emoji,matchingDraftRows}) => ({ id,title,emoji,matchingDraftRows }));
}
export function renderDraftJourney(): string {
  const storage = safeLocalStorage();
  const profile = storage ? readProfile(storage) : null;
  if (!profile || profile.status !== 'completed') return '';
  const htmlEscape = (s: string) => s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[ch] || ch));
  const items = draftJourney(profile);
  return `<section class="lga-draft-journey" aria-label="Draft learning journey">
    <h2>🧭 Your Draft Practice Journey</h2>
    <p>Local preview for ${htmlEscape(profile.countryCode)} · ${htmlEscape(profile.frameworkId)} · ${htmlEscape(profile.stage)}.
    This is a practice recommendation, <strong>not</strong> an approved national syllabus or assessment. The original Learning Library stays unchanged.</p>
    <div class="lga-draft-steps">${items.map((item,i)=>`<button type="button" data-tab="${item.id}">
      <span>${i+1}. ${item.emoji} ${item.title}</span>
      <small>${item.matchingDraftRows ? `${item.matchingDraftRows} Draft mapping ${item.matchingDraftRows===1?'row':'rows'} related` : 'General practice · no verified country mapping'}</small>
    </button>`).join('')}</div>
    <p>Unreviewed Urdu/Arabic content remains Draft. These are English-language mini-games only.</p>
  </section>`;
}
