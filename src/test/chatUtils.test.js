import { CHAT_ASSISTANT_PROMPT, needsHighRiskApproval, nextMsgId, shouldRouteThroughJose } from '../lib/chatUtils';

describe('chatUtils', () => {
  describe('CHAT_ASSISTANT_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof CHAT_ASSISTANT_PROMPT).toBe('string');
      expect(CHAT_ASSISTANT_PROMPT.length).toBeGreaterThan(0);
    });

    it('mentions Alphonso', () => {
      expect(CHAT_ASSISTANT_PROMPT).toContain('Alphonso');
    });
  });

  describe('nextMsgId', () => {
    it('returns a number', () => {
      expect(typeof nextMsgId()).toBe('number');
    });

    it('returns strictly increasing values', () => {
      const a = nextMsgId();
      const b = nextMsgId();
      expect(b).toBeGreaterThan(a);
    });
  });

  describe('shouldRouteThroughJose', () => {
    it('returns true for file-related commands', () => {
      expect(shouldRouteThroughJose('create a folder on desktop')).toBe(true);
      expect(shouldRouteThroughJose('rename this file')).toBe(true);
      expect(shouldRouteThroughJose('delete the old folder')).toBe(true);
    });

    it('returns true for system commands', () => {
      expect(shouldRouteThroughJose('run a command to list files')).toBe(true);
      expect(shouldRouteThroughJose('edit the config path')).toBe(true);
    });

    it('returns true for agent delegation and creative image requests', () => {
      expect(shouldRouteThroughJose('tell maia to generate an image for me')).toBe(true);
      expect(shouldRouteThroughJose('ask miya for a visual prompt')).toBe(true);
      expect(shouldRouteThroughJose('delegate this task to jose')).toBe(true);
    });

    it('returns false for conversational messages', () => {
      expect(shouldRouteThroughJose('hello how are you')).toBe(false);
    });

    it('routes conversational questions directly to Ollama', () => {
      expect(shouldRouteThroughJose('what is the capital of France')).toBe(false);
      expect(shouldRouteThroughJose('how does AI work?')).toBe(false);
      expect(shouldRouteThroughJose('explain machine learning')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(shouldRouteThroughJose('')).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(shouldRouteThroughJose(null)).toBe(false);
      expect(shouldRouteThroughJose(undefined)).toBe(false);
    });
  });

  describe('needsHighRiskApproval', () => {
    it('returns true for destructive action labels', () => {
      expect(needsHighRiskApproval('delete old files')).toBe(true);
      expect(needsHighRiskApproval('remove config')).toBe(true);
      expect(needsHighRiskApproval('write file to disk')).toBe(true);
    });

    it('returns true for external/publishing actions', () => {
      expect(needsHighRiskApproval('publish post to blog')).toBe(true);
      expect(needsHighRiskApproval('upload video to YouTube')).toBe(true);
      expect(needsHighRiskApproval('deploy application')).toBe(true);
    });

    it('returns false for safe actions', () => {
      expect(needsHighRiskApproval('summarize notes')).toBe(false);
      expect(needsHighRiskApproval('list conversations')).toBe(false);
    });

    it('handles empty string', () => {
      expect(needsHighRiskApproval('')).toBe(false);
    });
  });
});
