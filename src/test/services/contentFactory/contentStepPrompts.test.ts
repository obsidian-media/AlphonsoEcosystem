import { describe, it, expect } from 'vitest';
import { buildStepPrompt, parseStepAnswer } from '../../../services/contentFactory/contentStepPrompts';
import type { ContentStepPayload } from '../../../services/contentFactory/contentTypes';

const brand = {
  id: 'b1', name: 'Learn With Alphonso', folderName: 'lwa', palette: ['#0C6944'], fonts: 'Impact', logo: '',
  tone: 'warm, curious', audience: 'English learners', visualStyle: 'cinematic llamas', characterRefs: 'Alphonso, Hector',
  voice: { engine: 'kokoro', voiceId: 'af_heart' }, platforms: ['youtube'], schedule: '', honestyRules: 'Say it is AI-generated.',
  references: [{ url: 'https://example.com/ref', note: 'great hook' }],
  lessons: [{ atMs: 1, text: 'thumbnail: too much text', source: 'rejection' }],
  pastScripts: 'MY OLD SCRIPT TEXT', qualityThreshold: 7, createdAtMs: 1, updatedAtMs: 1,
} as ContentStepPayload['brand'];

function payload(writeInMyVoice = false): ContentStepPayload {
  return {
    projectId: 'p1', step: 'script', task: 'Write the script.', prior: { research: { patterns: ['fast cuts'] } }, brand,
    brief: { idea: 'Why we procrastinate', platforms: ['youtube'], outputs: ['long video'], format: 'voiceover_broll', lengthSec: 60, notes: '', writeInMyVoice, showEverything: false },
  };
}

const script = (hooks: string[]) => ({
  hooks, chosenHook: 0, title: 'Why we wait',
  script: [{ startSec: 0, endSec: 5, spoken: 'Hi', onScreenText: 'WHY', bRoll: 'clock', music: 'soft' }],
});

describe('buildStepPrompt', () => {
  it('includes the brand, its lessons, the research and the JSON instruction', () => {
    const { system, prompt } = buildStepPrompt(payload(), 'miya', 'creative_script');
    const all = `${system}\n${prompt}`;
    expect(all).toContain('Learn With Alphonso');
    expect(all).toContain('thumbnail: too much text');
    expect(all).toContain('fast cuts');
    expect(all).toContain('https://example.com/ref');
    expect(all).toContain('Return JSON only');
    expect(all).toContain('Why we procrastinate');
  });

  it('adds past scripts only when "write in my voice" is on', () => {
    expect(buildStepPrompt(payload(true), 'miya', 'creative_script').prompt).toContain('MY OLD SCRIPT TEXT');
    expect(buildStepPrompt(payload(false), 'miya', 'creative_script').prompt).not.toContain('MY OLD SCRIPT TEXT');
  });
});

describe('parseStepAnswer', () => {
  it('reads a script in a fenced reply', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify(script(['a', 'b', 'c'])) + '\n```';
    expect(parseStepAnswer('creative_script', text)).toMatchObject({ title: 'Why we wait' });
  });

  it('refuses a script with 2 hooks', () => {
    expect(parseStepAnswer('creative_script', JSON.stringify(script(['a', 'b'])))).toBeNull();
  });

  it('refuses a thumbnail headline longer than 6 words', () => {
    const concepts = [1, 2, 3].map((n) => ({ id: `t${n}`, headline: n === 2 ? 'one two three four five six seven eight nine' : 'SHORT ONE', imagePrompt: 'x', layout: 'left' }));
    expect(parseStepAnswer('creative_thumbnails', JSON.stringify({ concepts }))).toBeNull();
    concepts[1].headline = 'NOW IT FITS';
    expect(parseStepAnswer('creative_thumbnails', JSON.stringify({ concepts }))).not.toBeNull();
  });

  it('refuses text that is not JSON', () => {
    expect(parseStepAnswer('research_virality', 'not json')).toBeNull();
  });

  it('reads a review with scores in range, and refuses out-of-range ones', () => {
    expect(parseStepAnswer('analysis_content_review', JSON.stringify({ hookScore: 8, scriptScore: 7, notes: ['ok'], mustFix: [] }))).not.toBeNull();
    expect(parseStepAnswer('analysis_content_review', JSON.stringify({ hookScore: 11, scriptScore: 7, notes: [], mustFix: [] }))).toBeNull();
  });

  it('refuses an unknown action type', () => {
    expect(parseStepAnswer('creative_mystery', '{}')).toBeNull();
  });
});
