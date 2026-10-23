import { describe, it, expect } from 'vitest';
import { alignCaptions, captionsFromLines, toSrt } from '../../../services/contentFactory/contentCaptions';

const heard = (words: [string, number, number][]) => words.map(([word, start, end]) => ({ word, start, end }));

// Miya content factory phase 2a (design): captions only ever show the
// script's words; Whisper only supplies the timing.
describe('alignCaptions', () => {
  it('shows the script\'s word when Whisper misheard it', () => {
    const out = alignCaptions(['Their', 'coffee', 'is', 'great.'], heard([['There', 0, 0.3], ['coffee', 0.3, 0.7], ['is', 0.7, 0.8], ['great', 0.8, 1.2]]));
    expect(out.map((w) => w.word)).toEqual(['Their', 'coffee', 'is', 'great.']);
    expect(out[0]).toMatchObject({ start: 0, end: 0.3 });
    expect(out[3]).toMatchObject({ start: 0.8, end: 1.2 });
  });

  it('a word Whisper missed gets a time between its neighbours', () => {
    const out = alignCaptions(['One', 'quick', 'trick'], heard([['one', 0, 0.4], ['trick', 1.0, 1.4]]));
    expect(out.map((w) => w.word)).toEqual(['One', 'quick', 'trick']);
    expect(out[1].start).toBeGreaterThanOrEqual(0.4);
    expect(out[1].end).toBeLessThanOrEqual(1.0);
  });

  it('a word Whisper added that the script does not have is left out', () => {
    const out = alignCaptions(['Make', 'coffee'], heard([['make', 0, 0.3], ['um', 0.3, 0.5], ['coffee', 0.5, 0.9]]));
    expect(out.map((w) => w.word)).toEqual(['Make', 'coffee']);
    expect(out[1]).toMatchObject({ start: 0.5, end: 0.9 });
  });

  it('times only increase', () => {
    const out = alignCaptions(['a', 'b', 'c', 'd'], heard([['a', 0, 0.2], ['x', 0.2, 0.4], ['d', 1, 1.2]]));
    for (let i = 1; i < out.length; i += 1) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start);
  });
});

describe('captionsFromLines', () => {
  it('spreads each line\'s words over its time when there is no Whisper', () => {
    const out = captionsFromLines([{ text: 'Hello there friend', start: 0, end: 3 }, { text: 'Bye', start: 3, end: 4 }]);
    expect(out.map((w) => [w.word, w.start, w.end])).toEqual([['Hello', 0, 1], ['there', 1, 2], ['friend', 2, 3], ['Bye', 3, 4]]);
  });
});

describe('toSrt', () => {
  it('groups at most 6 words or 2.5 seconds, numbered, with SRT times', () => {
    const words = 'one two three four five six seven'.split(' ').map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.3 }));
    expect(toSrt(words, { maxWords: 6, maxSeconds: 2.5 })).toBe(
      '1\n00:00:00,000 --> 00:00:01,800\none two three four five six\n\n2\n00:00:01,800 --> 00:00:02,100\nseven\n',
    );
  });

  it('keeps quotes, colons and line breaks as plain text', () => {
    const srt = toSrt([{ word: 'Note:', start: 0, end: 0.5 }, { word: '"quoted"', start: 0.5, end: 1 }, { word: 'line\nbreak', start: 1, end: 1.5 }], { maxWords: 6, maxSeconds: 2.5 });
    expect(srt).toContain('Note: "quoted" line break');
  });

  it('starts a new caption after a long pause', () => {
    const srt = toSrt([{ word: 'a', start: 0, end: 0.3 }, { word: 'b', start: 3, end: 3.3 }], { maxWords: 6, maxSeconds: 2.5 });
    expect(srt.split('\n\n')).toHaveLength(2);
  });
});
