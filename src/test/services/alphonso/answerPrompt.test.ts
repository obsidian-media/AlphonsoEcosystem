// Agent phase 6: Alphonso's answering prompt.
import { describe, it, expect } from 'vitest';
import { ALPHONSO_ANSWER_PROMPT } from '../../../services/alphonso/answerPrompt';
import { assistantPrompt } from '../../../services/joseExecutionEngineService';
import { CHAT_ASSISTANT_PROMPT } from '../../../lib/chatUtils';

describe('ALPHONSO_ANSWER_PROMPT', () => {
  it('talks about no Direct Mode, never claims an action, and points to a plan for real work', () => {
    expect(ALPHONSO_ANSWER_PROMPT).not.toMatch(/direct mode/i);
    expect(ALPHONSO_ANSWER_PROMPT).toMatch(/conversation/i);
    expect(ALPHONSO_ANSWER_PROMPT).toMatch(/never say you (?:did|ran|changed|created)/i);
    expect(ALPHONSO_ANSWER_PROMPT).toMatch(/Jose/);
  });

  it('is what his answering steps use; Direct Mode keeps its own prompt', () => {
    expect(assistantPrompt('What is a closure?', null)).toContain(ALPHONSO_ANSWER_PROMPT);
    expect(assistantPrompt('What is a closure?', null)).not.toContain(CHAT_ASSISTANT_PROMPT);
    expect(CHAT_ASSISTANT_PROMPT).toMatch(/Direct Mode/);
  });
});
