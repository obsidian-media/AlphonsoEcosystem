import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as claudeService from '../../services/claudeService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../services/claudeService', () => ({
  sendClaudeMessage: vi.fn(async () => ({ ok: true, text: 'done' }))
}));

import { isCodingRequest, runCodingAgent } from '../../services/codingAgentService';

describe('codingAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCodingRequest', () => {
    it('returns true for "write a function"', () => {
      expect(isCodingRequest('write a function')).toBe(true);
    });
    it('returns true for "create a component"', () => {
      expect(isCodingRequest('create a component')).toBe(true);
    });
    it('returns true for "implement a migration"', () => {
      expect(isCodingRequest('implement a migration')).toBe(true);
    });
    it('returns true for "build a service"', () => {
      expect(isCodingRequest('build a service')).toBe(true);
    });
    it('returns true for "debug this module"', () => {
      expect(isCodingRequest('debug this module')).toBe(true);
    });
    it('returns true for "fix this hook"', () => {
      expect(isCodingRequest('fix this hook')).toBe(true);
    });
    it('returns true for "refactor the util"', () => {
      expect(isCodingRequest('refactor the util')).toBe(true);
    });
    it('returns false for connector mentions', () => {
      expect(isCodingRequest('send a telegram message')).toBe(false);
      expect(isCodingRequest('post to github')).toBe(false);
      expect(isCodingRequest('upload to youtube')).toBe(false);
      expect(isCodingRequest('send notification')).toBe(false);
    });
    it('returns false for connector commands with coding words', () => {
      expect(isCodingRequest('write code and send to telegram')).toBe(false);
    });
    it('returns false for non-coding text', () => {
      expect(isCodingRequest('what is the weather')).toBe(false);
      expect(isCodingRequest('hello world')).toBe(false);
    });
    it('returns false for empty/null input', () => {
      expect(isCodingRequest('')).toBe(false);
      expect(isCodingRequest(null as unknown as string)).toBe(false);
      expect(isCodingRequest(undefined as unknown as string)).toBe(false);
    });
  });

  describe('runCodingAgent', () => {
    it('calls sendClaudeMessage with task and system prompt', async () => {
      (claudeService.sendClaudeMessage as any).mockResolvedValueOnce({ ok: true, text: 'result' });
      const result = await runCodingAgent('write a function');
      expect(claudeService.sendClaudeMessage).toHaveBeenCalledWith(
        'write a function',
        expect.objectContaining({ system: expect.stringContaining('software engineer') })
      );
      expect(result).toEqual({ ok: true, content: 'result' });
    });
    it('merges custom options', async () => {
      (claudeService.sendClaudeMessage as any).mockResolvedValueOnce({ ok: true, text: 'done' });
      await runCodingAgent('task', { model: 'gpt-4' });
      expect(claudeService.sendClaudeMessage).toHaveBeenCalledWith(
        'task',
        expect.objectContaining({ model: 'gpt-4' })
      );
    });
    it('returns error when response is not ok', async () => {
      (claudeService.sendClaudeMessage as any).mockResolvedValueOnce({ ok: false, error: 'bad request' });
      const result = await runCodingAgent('task');
      expect(result).toEqual({ ok: false, error: 'bad request' });
    });
    it('returns error when response is null', async () => {
      (claudeService.sendClaudeMessage as any).mockResolvedValueOnce(null);
      const result = await runCodingAgent('task');
      expect(result).toEqual({ ok: false, error: 'No response from coding agent' });
    });
    it('returns error on exception', async () => {
      (claudeService.sendClaudeMessage as any).mockRejectedValueOnce(new Error('network'));
      const result = await runCodingAgent('task');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('network');
    });
  });
});
