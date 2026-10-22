// Types for Miya's content factory.
// Design: docs/superpowers/specs/2026-10-22-miya-content-factory-design.md

export interface ContentBrand {
  id: string;
  name: string;
  folderName: string;
  palette: string[];
  fonts: string;
  logo: string;
  tone: string;
  audience: string;
  visualStyle: string;
  characterRefs: string;
  voice: { engine: 'kokoro'; voiceId: string };
  platforms: string[];
  schedule: string;
  honestyRules: string;
  references: { url: string; note: string }[];
  lessons: { atMs: number; text: string; source: 'rejection' | 'user' }[];
  pastScripts: string;
  qualityThreshold: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export type StepId = 'brief' | 'research' | 'script' | 'review' | 'scenes' | 'thumbnail' | 'campaign' | 'quality';

export const STEP_ORDER: StepId[] = ['brief', 'research', 'script', 'review', 'scenes', 'thumbnail', 'campaign', 'quality'];
