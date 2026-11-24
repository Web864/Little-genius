// Phase 6: audio provenance model + voice selection. Pure logic. The app today has NO recorded audio: all speech is browser
// speech synthesis. This module makes that fact explicit and refuses to let synthetic speech be described as native-recorded.
import type { Locale } from './localization.ts';
import { LOCALES } from './localization.ts';
import type { ReviewStatus } from './types.ts';

export type ClipSource = 'recorded-native' | 'recorded-other' | 'synthetic-tts' | 'none';
export interface Provenance { speaker: string; recordedOn: string; consentRecorded: boolean }
export interface ClipEntry {
  id: string; text: string; language: 'en' | 'ur' | 'ar'; source: ClipSource;
  provenance: Provenance | null; reviewer: string | null; status: ReviewStatus; file?: string;
}

/** The only label a learner-facing screen may show for each source. */
export function audioLabel(source: ClipSource): string {
  switch (source) {
    case 'synthetic-tts': return 'Computer voice';
    case 'recorded-native': return 'Recorded by a native speaker';
    case 'recorded-other': return 'Recorded voice';
    default: return 'No audio';
  }
}

export function validateClips(clips: readonly ClipEntry[]): string[] {
  const errs: string[] = []; const seen = new Set<string>();
  for (const c of clips) {
    const w = (m: string): number => errs.push(c.id + ': ' + m);
    if (seen.has(c.id)) w('duplicate id'); seen.add(c.id);
    if (!c.text.trim()) w('empty text');
    if (c.source === 'recorded-native' || c.source === 'recorded-other') {
      if (!c.file) w('recorded clip needs a file');
      if (!c.provenance) w('recorded clip needs provenance (speaker, date, consent)');
      else if (!c.provenance.consentRecorded) w('speaker consent not recorded');
    }
    if (c.source === 'recorded-native' && !c.reviewer) w('"native" claim needs a named native reviewer');
    if (c.source === 'synthetic-tts') {
      if (c.file) w('synthetic speech has no recorded file');
      if (c.provenance) w('synthetic speech cannot carry recording provenance');
      if (c.reviewer && /native/i.test(c.reviewer)) w('synthetic speech cannot be reviewed as a native recording');
    }
    if (c.source === 'none' && (c.file || c.provenance)) w('"none" cannot have a file or provenance');
    if (c.status !== 'draft' && !c.reviewer) w('above Draft needs a reviewer');
    if ((c.language === 'ur' || c.language === 'ar') && c.status !== 'draft' && !c.reviewer) w('ur/ar needs native-educator review above Draft');
  }
  return errs;
}

// ---- voice selection ---------------------------------------------------------------------------------------------
export interface VoiceLike { lang: string; name: string; localService?: boolean }
export type VoiceQuality = 'exact' | 'language' | 'none';
export interface VoicePick<V extends VoiceLike> { voice: V | null; quality: VoiceQuality; utteranceLang: string; source: ClipSource; label: string }
const norm = (s: string): string => s.toLowerCase().replace('_', '-');

/** exact region match > same language > none. Never substitutes another language (no English voice reading Urdu). */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], locale: Locale): VoicePick<V> {
  const want = norm(LOCALES[locale].bcp47);
  const lang = want.split('-')[0];
  const exact = voices.find((v) => norm(v.lang) === want);
  const same = voices.find((v) => norm(v.lang).split('-')[0] === lang);
  const voice = exact ?? same ?? null;
  const quality: VoiceQuality = exact ? 'exact' : same ? 'language' : 'none';
  // A browser voice is always synthetic, however natural it sounds.
  return { voice, quality, utteranceLang: LOCALES[locale].bcp47, source: voice ? 'synthetic-tts' : 'none', label: audioLabel(voice ? 'synthetic-tts' : 'none') };
}
