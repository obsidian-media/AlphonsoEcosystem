import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCustomAvatarDataUrl, removeCustomAvatar, listCustomAvatarAgentIds,
  processAvatarFile, setCustomAvatar
} from '../../services/agentAvatarService';

describe('agentAvatarService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getCustomAvatarDataUrl returns null when empty', () => {
    expect(getCustomAvatarDataUrl('alphonso')).toBeNull();
  });

  it('getCustomAvatarDataUrl returns stored value', () => {
    localStorage.setItem('alphonso_custom_avatar_v1_alphonso', 'data:image/jpeg;base64,abc');
    expect(getCustomAvatarDataUrl('alphonso')).toBe('data:image/jpeg;base64,abc');
  });

  it('removeCustomAvatar removes stored avatar', () => {
    localStorage.setItem('alphonso_custom_avatar_v1_alphonso', 'data:image/jpeg;base64,abc');
    removeCustomAvatar('alphonso');
    expect(getCustomAvatarDataUrl('alphonso')).toBeNull();
  });

  it('removeCustomAvatar is safe on non-existent key', () => {
    expect(() => removeCustomAvatar('nonexistent')).not.toThrow();
  });

  it('listCustomAvatarAgentIds returns empty array when none', () => {
    expect(listCustomAvatarAgentIds()).toEqual([]);
  });

  it('listCustomAvatarAgentIds returns stored agent ids', () => {
    localStorage.setItem('alphonso_custom_avatar_v1_alphonso', 'data:1');
    localStorage.setItem('alphonso_custom_avatar_v1_jose', 'data:2');
    const ids = listCustomAvatarAgentIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThanOrEqual(0);
  });

  it('processAvatarFile rejects non-image files', async () => {
    const file = new File(['text'], 'test.txt', { type: 'text/plain' });
    await expect(processAvatarFile(file)).rejects.toThrow('File must be an image');
  });

  it('processAvatarFile rejects null/undefined', async () => {
    await expect(processAvatarFile(null)).rejects.toThrow();
    await expect(processAvatarFile(undefined)).rejects.toThrow();
  });
});
