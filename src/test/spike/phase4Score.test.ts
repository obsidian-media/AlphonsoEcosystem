// Phone phase 4 test round (throwaway, spike/phone-phase4): the shared question set and its scorer.
import { describe, expect, it } from 'vitest';
import { PHASE4_QUESTIONS, type SpikeQuestion } from '../../mobile/spike/phase4Questions';
import { redactKeys, scoreAnswer, summarize, type SpikeAnswer } from '../../mobile/spike/phase4Score';
import { joseDecisionPrompt, ruleRoute } from '../../services/jose/joseDecision';
import { ALPHONSO_ANSWER_PROMPT } from '../../services/alphonso/answerPrompt';

const answer = (questionId: string, text: string | null, extra: Partial<SpikeAnswer> = {}): SpikeAnswer => ({
  questionId, engine: 'phone', model: 'apple', text, ms: 100, error: null, ...extra,
});
const q = (agent: SpikeQuestion['agent'], expect: SpikeQuestion['expect']): SpikeQuestion => ({ id: 'x', agent, system: '', prompt: 'p', expect });

describe('scoreAnswer', () => {
  it('jose: passes when the JSON route matches', () => {
    const jq = q('jose', { route: 'plan' });
    expect(scoreAnswer(jq, answer('x', '{"route":"plan","reason":"x"}')).pass).toBe(true);
    expect(scoreAnswer(jq, answer('x', '{"route":"direct","reason":"x"}'))).toEqual({ pass: false, why: 'route direct, expected plan' });
    expect(scoreAnswer(jq, answer('x', 'I would plan this.'))).toEqual({ pass: false, why: 'no JSON route' });
  });

  it('echo: passes only when every expected fact is in the answer', () => {
    const eq = q('echo', { contains: ['Friday', 'Montreal'] });
    expect(scoreAnswer(eq, answer('x', 'You decided on friday, in montreal.')).pass).toBe(true);
    expect(scoreAnswer(eq, answer('x', 'You decided on Friday.')).pass).toBe(false);
  });

  it('alphonso: fails an answer that claims it did something', () => {
    const aq = q('alphonso', {});
    expect(scoreAnswer(aq, answer('x', "I've sent the email to Sam.")).pass).toBe(false);
    expect(scoreAnswer(aq, answer('x', 'I saved the file.')).pass).toBe(false);
    expect(scoreAnswer(aq, answer('x', 'Here is the email:\n\nHi Sam, …')).pass).toBe(true);
  });

  it('alphonso: a computer-work question must mention Jose', () => {
    const aq = q('alphonso', { mentionsJose: true });
    expect(scoreAnswer(aq, answer('x', 'Jose can plan that if you ask.')).pass).toBe(true);
    expect(scoreAnswer(aq, answer('x', 'Open the file and change line 3.')).pass).toBe(false);
  });

  it('an error or empty answer fails with the error as why', () => {
    const aq = q('alphonso', {});
    expect(scoreAnswer(aq, answer('x', null, { error: 'Context window exceeded' }))).toEqual({ pass: false, why: 'Context window exceeded' });
    expect(scoreAnswer(aq, answer('x', '   '))).toEqual({ pass: false, why: 'empty answer' });
  });
});

describe('summarize', () => {
  it('counts per engine and agent and gives the median time', () => {
    const ids = Object.fromEntries(['jose', 'alphonso', 'echo'].map((agent) => [agent, PHASE4_QUESTIONS.find((x) => x.agent === agent)!.id]));
    const s = summarize([
      answer(ids.alphonso, 'More milk.', { ms: 100 }),
      answer(ids.alphonso, "I've sent the milk.", { ms: 300 }),
      answer(ids.alphonso, 'More milk.', { ms: 200 }),
      answer(ids.jose, '{"route":"direct"}', { engine: 'desktop', ms: 50 }),
    ]);
    expect(s.phone.alphonso).toEqual({ passed: 2, total: 3, medianMs: 200 });
    expect(s.desktop.jose.total).toBe(1);
    expect(s.phone.echo).toEqual({ passed: 0, total: 0, medianMs: 0 });
  });
});

describe('redactKeys', () => {
  it('hides a key inside a provider error', () => {
    const out = redactKeys('401: bad key sk-or-v1-abcdef1234567890abcdef1234567890');
    expect(out).not.toContain('abcdef1234567890abcdef');
  });
});

describe('PHASE4_QUESTIONS', () => {
  it('every question is built from the real prompts', () => {
    const by = (a: string) => PHASE4_QUESTIONS.filter((x) => x.agent === a);
    const jose = by('jose');
    expect(jose).toHaveLength(10);
    expect(jose.filter((x) => x.expect.route === 'direct')).toHaveLength(5);
    expect(jose.filter((x) => x.expect.route === 'plan')).toHaveLength(5);
    for (const x of jose) {
      expect(x.message).toBeTruthy();
      expect(x.prompt).toBe(joseDecisionPrompt(x.message!));
      expect(ruleRoute(x.message!)).toBeNull();
    }
    const alphonso = by('alphonso');
    expect(alphonso).toHaveLength(6);
    expect(alphonso.every((x) => x.system === ALPHONSO_ANSWER_PROMPT)).toBe(true);
    expect(alphonso.filter((x) => x.expect.mentionsJose)).toHaveLength(1);
    const echo = by('echo');
    expect(echo).toHaveLength(4);
    for (const x of echo) {
      expect(x.prompt).toContain('Decisions you saved:');
      expect(x.prompt).toMatch(/^(Decided|Preference|You turned down) \d+ \w+ \(/m);
      expect(x.expect.contains?.length).toBeGreaterThan(0);
    }
    expect(new Set(PHASE4_QUESTIONS.map((x) => x.id)).size).toBe(PHASE4_QUESTIONS.length);
  });
});
