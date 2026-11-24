// AICS public surface. Not imported by any existing screen in Phase 2.
export * from './types.ts';
export { DOMAINS, COMPETENCIES, getCompetency } from './competencyRegistry.ts';
export { COUNTRIES, FUTURE_MARKETS, getCountry, resolveProfile } from './countryRegistry.ts';
export { FRAMEWORKS, getFramework } from './curriculumRegistry.ts';
export { MAPPINGS, activitiesFor } from './curriculumMappings.ts';
export { buildPack, listPacks, packRows } from './packs.ts';
export type { PackSummary } from './packs.ts';
export { ACTIVITIES, getActivity } from './activityRegistry.ts';
export { validateRegistries } from './validate.ts';
export * from './onboardingService.ts';
export {
  LEGACY_KEYS, AICS_KEYS, migrate, buildProgressDoc, readProgressDoc, resetAicsData, summarizeByCompetency,
  detectLegacyStorage, legacySnapshot, rollbackMigration, validateProgressDoc, inspectProgressDoc, PROGRESS_SCHEMA_VERSION,
} from './progressService.ts';
export { runAicsBootstrap, scheduleAicsBootstrap, getLastBootstrapResult, KILL_SWITCH_KEY } from './bootstrap.ts';
export { maybeRunOnboarding, openWizard } from './onboarding.ts';
export { aicsWorlds, planWorlds, TAB_ACTIVITIES, WORLDS_DISABLED_KEY } from './worlds.ts';
export type { WorldsPlan } from './worlds.ts';
export * from './localization.ts';
export * from './audio.ts';
export * from './accountScope.ts';
export * from './ownership.ts';
export * from './sha256.ts';
export * from './packRelease.ts';
export * from './ownerCurriculum.ts';
export * from './publishedGate.ts';
export * from './schoolSettings.ts';
export * from './curriculumManager.ts';
export * from './parentControls.ts';
export * from './schoolConfig.ts';
export * from './schoolService.ts';
