// Nova's ranked verdict (agent phase 2, owner 2026-10-25): every option in order with
// reasons in words, what to do first, what would change her mind; no keyword scores.
import { describe, it, expect, vi } from 'vitest';
import { namedOptions, findOptions, novaVerdictPrompt, parseNovaVerdict, missingOptions, withNotJudged, verdictText, type NovaVerdict } from '../../../services/nova/novaVerdict';
import type { StepInput } from '../../../services/jose/stepInput';

const BAKERY = 'Which of these should a small bakery do first: a weekly email newsletter, a loyalty card, or a podcast? Prioritize them.';

const input = (over: Partial<StepInput> = {}): StepInput => ({ instruction: '', request: BAKERY, needs: [], others: [], memory: '', review: null, ...over });

const verdict = (over: Partial<NovaVerdict> = {}): NovaVerdict => ({
  doFirst: 'the email newsletter',
  options: [
    { name: 'Email newsletter', rank: 1, why: 'cheap and quick to start.', value: 'high', effort: 'low', risk: 'low', sources: [2, 4] },
    { name: 'Loyalty card', rank: 2, why: 'brings regulars back.', value: 'medium', effort: 'low', risk: 'low', sources: [] },
  ],
  wouldChange: 'if few customers give their email, start with the loyalty card.',
  fromRequestOnly: false,
  ...over,
});

describe('namedOptions', () => {
  it('finds the options after a colon', () => {
    expect(namedOptions(BAKERY)).toEqual(['a weekly email newsletter', 'a loyalty card', 'a podcast']);
  });

  it('namedOptions reads lists written with and, or and lines', () => {
    expect(namedOptions('Should we do the newsletter and the podcast?')).toEqual(['the newsletter', 'the podcast']);
    expect(namedOptions('Options:\n- newsletter\n- loyalty card')).toEqual(['newsletter', 'loyalty card']);
    expect(namedOptions('What is the capital of France?')).toEqual([]);
  });
});

describe('parseNovaVerdict', () => {
  it('parses a ranked verdict, words not numbers', () => {
    const text = JSON.stringify({
      doFirst: 'the loyalty card',
      options: [
        { name: 'Podcast', rank: 2, why: 'slow to grow.', value: 80, effort: 'high', risk: 'medium', sources: [] },
        { name: 'Loyalty card', rank: 1, why: 'brings regulars back.', value: 'high', effort: 'low', risk: 'low', sources: [1] },
      ],
      wouldChange: 'a large mailing list',
      score: 70,
    });
    const v = parseNovaVerdict(text, { sourceCount: 2, fromRequestOnly: false })!;
    expect(v.options.map((o) => o.name)).toEqual(['Loyalty card', 'Podcast']);
    expect(v.options[1].value).toBe('medium');
    expect(v.score).toBeUndefined();
  });

  it('keeps score only for a single option', () => {
    const v = parseNovaVerdict(JSON.stringify({ doFirst: 'go', options: [{ name: 'Launch', rank: 1, why: 'ready.', value: 'high', effort: 'low', risk: 'low' }], score: 172 }), { sourceCount: 0, fromRequestOnly: true })!;
    expect(v.score).toBe(100);
  });

  it('drops source numbers that do not exist', () => {
    const v = parseNovaVerdict(JSON.stringify({ doFirst: 'x', options: [{ name: 'A', rank: 1, why: 'w', value: 'high', effort: 'low', risk: 'low', sources: [1, 4] }] }), { sourceCount: 3, fromRequestOnly: false })!;
    expect(v.options[0].sources).toEqual([1]);
  });

  it('unreadable or empty is null', () => {
    expect(parseNovaVerdict('I think the newsletter', { sourceCount: 0, fromRequestOnly: true })).toBeNull();
    expect(parseNovaVerdict('{"options": []}', { sourceCount: 0, fromRequestOnly: true })).toBeNull();
  });
});

describe('options left out', () => {
  it('missingOptions matches by a shared word', () => {
    expect(missingOptions(verdict(), ['a weekly email newsletter', 'a loyalty card', 'a podcast'])).toEqual(['a podcast']);
  });

  it('withNotJudged lists the missing last', () => {
    const v = withNotJudged(verdict(), ['a podcast']);
    const last = v.options[v.options.length - 1];
    expect(last).toMatchObject({ name: 'a podcast', notJudged: true });
    expect(last.rank).toBe(3);
  });
});

describe('verdictText', () => {
  it('verdictText starts with what to do first', () => {
    const text = verdictText(withNotJudged(verdict(), ['a podcast']));
    expect(text.startsWith('What to do first: the email newsletter.')).toBe(true);
    expect(text).toContain('1. Email newsletter: cheap and quick to start. Value high, effort low, risk low. [2][4]');
    expect(text).toContain('3. a podcast: not judged.');
    expect(text.trim().endsWith('Would change this: if few customers give their email, start with the loyalty card.')).toBe(true);
  });

  it('says when it was judged from the request only', () => {
    expect(verdictText(verdict({ fromRequestOnly: true })).split('\n')[0]).toBe('Judged from your request only.');
  });
});

describe('novaVerdictPrompt', () => {
  it('the prompt offers HELP only when asked', () => {
    const skilled = input({ skill: { name: 'Value and priority', reason: 'r', instructions: 'Say what is worth doing.', results: [] } });
    const withHelp = novaVerdictPrompt(skilled, { sourceCount: 0, mayAskForHelp: true });
    expect(withHelp).toContain('HELP: research');
    expect(withHelp.indexOf('Your skill: Value and priority')).toBeLessThan(withHelp.indexOf('You are Nova'));
    expect(novaVerdictPrompt(input(), { sourceCount: 0, mayAskForHelp: false })).not.toContain('HELP:');
    expect(novaVerdictPrompt(input(), { sourceCount: 0, mayAskForHelp: false, leftOut: ['a podcast'] })).toContain('You left out: a podcast.');
  });
});

// Agent roles Part C2: Nova finds the options a request names in any wording.
describe('findOptions', () => {
  const TORN = "I'm torn between opening a second shop in Leeds and selling online through Etsy, which is better?";

  it('asks her model when the request has a choice in ordinary sentences, and keeps its options', async () => {
    const ask = vi.fn(async () => JSON.stringify({ options: ['opening a second shop in Leeds', 'selling online through Etsy'] }));
    expect(await findOptions(TORN, ask)).toEqual(['opening a second shop in Leeds', 'selling online through Etsy']);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('drops an option the request never names', async () => {
    const ask = vi.fn(async () => JSON.stringify({ options: ['opening a second shop in Leeds', 'selling online through Etsy', 'a food truck'] }));
    expect(await findOptions(TORN, ask)).toEqual(['opening a second shop in Leeds', 'selling online through Etsy']);
  });

  it('a list makes no model call, and no choice word makes none', async () => {
    const ask = vi.fn(async () => '{}');
    expect(await findOptions('Which should we start first: a newsletter, a podcast, a shop?', ask)).toEqual(['a newsletter', 'a podcast', 'a shop']);
    expect(await findOptions('Judge how the launch went.', ask)).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });

  it('an unreadable answer, or one option only, finds none', async () => {
    expect(await findOptions(TORN, async () => 'not json')).toEqual([]);
    expect(await findOptions(TORN, async () => JSON.stringify({ options: ['selling online through Etsy'] }))).toEqual([]);
  });
});
