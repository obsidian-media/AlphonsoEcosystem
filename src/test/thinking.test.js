import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitThinking, joinThinking } from '../lib/thinking';
import { generateOllamaChatStream } from '../lib/ollama';

// Owner, 2026-10-22 (QA Q7): a thinking model's reasoning is shown folded
// above the answer, or hidden by a setting. Until then it was dropped, and
// with older Ollama versions it appeared inside the answer as <think>...</think>.

function streamOf(objects) {
  const encoded = new TextEncoder().encode(objects.map((o) => JSON.stringify(o)).join('\n'));
  const reader = { read: vi.fn().mockResolvedValueOnce({ done: false, value: encoded }).mockResolvedValueOnce({ done: true, value: undefined }) };
  return { ok: true, body: { getReader: () => reader } };
}

describe('splitThinking', () => {
  it('separates <think> reasoning from the answer', () => {
    expect(splitThinking('<think>2+3 is 5</think>\n\nFive.')).toEqual({ thinking: '2+3 is 5', answer: 'Five.' });
  });

  it('treats an unclosed <think> as reasoning still streaming', () => {
    expect(splitThinking('<think>adding two and thr')).toEqual({ thinking: 'adding two and thr', answer: '' });
  });

  it('leaves an ordinary answer alone', () => {
    expect(splitThinking('Hello there')).toEqual({ thinking: '', answer: 'Hello there' });
    expect(joinThinking('', null, 'a', ' b ')).toBe('a\n\nb');
  });
});

describe('generateOllamaChatStream and thinking', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes reasoning sent apart (message.thinking) to onThinking, never into the answer', async () => {
    global.fetch = vi.fn().mockResolvedValue(streamOf([
      { message: { role: 'assistant', content: '', thinking: 'The user asks 2+3. ' }, done: false },
      { message: { role: 'assistant', content: '', thinking: 'That is 5.' }, done: false },
      { message: { role: 'assistant', content: 'Five.' }, done: false },
      { done: true },
    ]));
    const thoughts = [];
    const answer = await generateOllamaChatStream({ endpoint: 'http://localhost:11434', model: 'qwen3:0.6b', messages: [], onThinking: (t) => thoughts.push(t) });
    expect(answer).toBe('Five.');
    expect(thoughts.at(-1)).toBe('The user asks 2+3. That is 5.');
  });

  it('takes <think> reasoning out of the answer (older Ollama)', async () => {
    global.fetch = vi.fn().mockResolvedValue(streamOf([
      { message: { content: '<think>adding' }, done: false },
      { message: { content: ' them</think>' }, done: false },
      { message: { content: 'Five.' }, done: false },
      { done: true },
    ]));
    const thoughts = [];
    const tokens = [];
    const answer = await generateOllamaChatStream({ endpoint: 'http://localhost:11434', model: 'deepseek-r1', messages: [], onThinking: (t) => thoughts.push(t), onToken: (_t, full) => tokens.push(full) });
    expect(answer).toBe('Five.');
    expect(thoughts.at(-1)).toBe('adding them');
    expect(tokens.every((t) => !t.includes('think'))).toBe(true);
  });
});
