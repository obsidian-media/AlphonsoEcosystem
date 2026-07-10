import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/ollama', async () => {
  const actual = await vi.importActual('../../lib/ollama');
  return {
    ...actual,
    generateOllamaResponse: vi.fn()
  };
});

describe('boardroomFacilitatorService', () => {
  describe('buildFacilitatorPrompt', () => {
    it('includes the thread topic and the new message', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Q3 Growth Plan',
        priorMessages: [],
        newMessageText: 'We need a plan to grow enterprise signups this quarter.'
      });
      expect(prompt).toContain('Q3 Growth Plan');
      expect(prompt).toContain('We need a plan to grow enterprise signups this quarter.');
    });

    it('includes prior message history in speaker: content format', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Test',
        priorMessages: [
          { speaker: 'user', content: 'First question' },
          { speaker: 'alphonso', content: 'First answer' }
        ],
        newMessageText: 'Follow-up question'
      });
      expect(prompt).toContain('user: First question');
      expect(prompt).toContain('alphonso: First answer');
      expect(prompt).toContain('Follow-up question');
    });

    it('instructs Alphonso to name other agents when relevant, not just answer directly', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({ topic: 'Test', priorMessages: [], newMessageText: 'hi' });
      expect(prompt.toLowerCase()).toContain('@hector');
      expect(prompt.toLowerCase()).toContain('facilitator');
    });
  });

  describe('generateAlphonsoResponse', () => {
    it('calls generateOllamaResponse with the built prompt and returns the response text', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'Got it — pulling in Hector.', done: true });

      const { generateAlphonsoResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAlphonsoResponse({
        topic: 'Q3 Growth Plan',
        priorMessages: [],
        newMessageText: 'We need a plan.'
      });

      expect(result.ok).toBe(true);
      expect(result.text).toBe('Got it — pulling in Hector.');
      expect(ollama.generateOllamaResponse).toHaveBeenCalledWith(
        expect.objectContaining({ model: expect.any(String), prompt: expect.stringContaining('We need a plan.') })
      );
    });

    it('returns ok:false with an error message when Ollama call throws', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockRejectedValue(new Error('Ollama is not running'));

      const { generateAlphonsoResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAlphonsoResponse({
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Ollama is not running');
    });
  });

  describe('generateAgentResponse', () => {
    it("builds a persona prompt using the target agent's real role from agentRegistry, not a hardcoded Alphonso description", async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'On it — checking sources now.', done: true });

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'hector',
        topic: 'Q3 Growth Plan',
        priorMessages: [],
        newMessageText: '@Hector can you research current market signals?'
      });

      expect(result.ok).toBe(true);
      expect(result.text).toBe('On it — checking sources now.');
      const promptArg = (ollama.generateOllamaResponse as any).mock.calls[0][0].prompt;
      expect(promptArg.toLowerCase()).toContain('hector');
      expect(promptArg.toLowerCase()).toContain('research');
    });

    it('falls back to a generic persona for an unknown agent id rather than throwing', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'ok', done: true });

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'nonexistent',
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.ok).toBe(true);
    });

    it('propagates errors the same way generateAlphonsoResponse does', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockRejectedValue(new Error('Ollama is not running'));

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'maria',
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Ollama is not running');
    });
  });

  describe('cross-thread context in prompts', () => {
    it('includes a labeled cross-thread context block when crossThreadContext is provided', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Renewal Terms',
        priorMessages: [],
        newMessageText: 'What did we decide on pricing?',
        agentId: 'jose',
        crossThreadContext: [
          { threadId: 't1', threadTopic: 'Q3 Pricing', speaker: 'jose', content: 'Tiered pricing decided.', score: 2 }
        ]
      });

      expect(prompt).toContain('Relevant context from other threads');
      expect(prompt).toContain('Q3 Pricing');
      expect(prompt).toContain('Tiered pricing decided.');
    });

    it('omits the cross-thread block entirely when no context is provided', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Renewal Terms',
        priorMessages: [],
        newMessageText: 'Hello',
        agentId: 'jose'
      });

      expect(prompt).not.toContain('Relevant context from other threads');
    });
  });

  describe('detectLowConfidence', () => {
    it('flags text containing a hedging phrase', async () => {
      const { detectLowConfidence } = await import('../../services/boardroomFacilitatorService');
      expect(detectLowConfidence("I'm not sure, but it might be related to pricing.")).toBe(true);
      expect(detectLowConfidence('This is unclear without more data.')).toBe(true);
      expect(detectLowConfidence('I would need more context to answer that properly.')).toBe(true);
    });

    it('does not flag confident, direct text', async () => {
      const { detectLowConfidence } = await import('../../services/boardroomFacilitatorService');
      expect(detectLowConfidence('The Q3 pricing tier is finalized at $49/mo for the enterprise plan.')).toBe(false);
    });

    it('is case-insensitive', async () => {
      const { detectLowConfidence } = await import('../../services/boardroomFacilitatorService');
      expect(detectLowConfidence('Honestly, I DON\'T HAVE ENOUGH INFORMATION to say.')).toBe(true);
    });
  });
});
