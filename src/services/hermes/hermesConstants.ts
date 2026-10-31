// Hermes gateway (2026-10-30): the app's copy of the reading toolsets. The
// backend's READING_TOOLSETS (hermes_profiles.rs) is the one Alphonso's profiles
// use; src/test/services/hermes/hermesConstants.test.ts fails when they differ.
export const READING_TOOLSETS = ['web', 'vision', 'memory', 'session_search', 'todo', 'clarify'] as const;
