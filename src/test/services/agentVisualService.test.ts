import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/agentAvatarService', () => ({
  getCustomAvatarDataUrl: vi.fn(() => null)
}));

import { getAgentMascotPath, getAgentInitials } from '../../services/agentVisualService';
import { getCustomAvatarDataUrl } from '../../services/agentAvatarService';

describe('agentVisualService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCustomAvatarDataUrl as any).mockReturnValue(null);
  });

  describe('getAgentMascotPath', () => {
    it('returns null for unknown agent', () => {
      expect(getAgentMascotPath('unknown')).toBeNull();
    });
    it('returns null for empty string', () => {
      expect(getAgentMascotPath('')).toBeNull();
    });
    it('returns null for undefined', () => {
      expect(getAgentMascotPath(undefined as unknown as string)).toBeNull();
    });
    it('returns custom avatar when set', () => {
      (getCustomAvatarDataUrl as any).mockReturnValueOnce('data:image/webp;base64,abc');
      const result = getAgentMascotPath('jose');
      expect(result).toBe('data:image/webp;base64,abc');
      expect(getCustomAvatarDataUrl).toHaveBeenCalledWith('jose');
    });
    it('returns built-in mascot for known agents', () => {
      const result = getAgentMascotPath('jose');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
    it('handles case-insensitive agent id', () => {
      const result = getAgentMascotPath('JOSE');
      expect(result).toBeTruthy();
    });
  });

  describe('getAgentInitials', () => {
    it('returns two-letter initials for two-word name', () => {
      expect(getAgentInitials('John Smith')).toBe('JS');
    });
    it('returns two-letter initials for multi-word name', () => {
      expect(getAgentInitials('John Michael Smith')).toBe('JM');
    });
    it('returns first two chars for single word', () => {
      expect(getAgentInitials('Jose')).toBe('JO');
    });
    it('returns single char name truncated to two', () => {
      expect(getAgentInitials('A')).toBe('A');
    });
    it('returns ? for empty string', () => {
      expect(getAgentInitials('')).toBe('?');
    });
    it('returns ? for whitespace only', () => {
      expect(getAgentInitials('   ')).toBe('?');
    });
    it('handles leading/trailing whitespace', () => {
      expect(getAgentInitials('  John  ')).toBe('JO');
    });
    it('uppercases lowercase input', () => {
      expect(getAgentInitials('john smith')).toBe('JS');
    });
  });
});
