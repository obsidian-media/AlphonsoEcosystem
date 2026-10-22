import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../services/agentActivityService.js', () => ({
  appendAgentActivity: vi.fn()
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('setInterval', vi.fn());
vi.stubGlobal('clearInterval', vi.fn());

import {
  startVoiceServer,
  stopVoiceServer,
  getVoiceServerStatus,
  getVoiceWebSocketUrl,
  startVoiceWatchdog,
  stopVoiceWatchdog,
  checkVoiceWatchdog,
  resetVoiceWatchdogState
} from '../../services/voiceOsService';

import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from '../../services/agentActivityService.js';

describe('voiceOsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    invoke.mockResolvedValue({});
    appendAgentActivity.mockReturnValue(undefined);
  });

  it('startVoiceServer calls invoke and logs activity', async () => {
    invoke.mockResolvedValue({ status: 'running' });
    const result = await startVoiceServer();
    expect(invoke).toHaveBeenCalledWith('voice_start');
    expect(appendAgentActivity).toHaveBeenCalledWith({
      agent: 'alphonso',
      action: 'voice_server_start',
      detail: 'Voice OS started'
    });
  });

  it('stopVoiceServer calls invoke and logs activity', async () => {
    invoke.mockResolvedValue({});
    await stopVoiceServer();
    expect(invoke).toHaveBeenCalledWith('voice_stop');
    expect(appendAgentActivity).toHaveBeenCalledWith({
      agent: 'alphonso',
      action: 'voice_server_stop',
      detail: 'Voice OS stopped'
    });
  });

  it('getVoiceServerStatus returns invoke result', async () => {
    invoke.mockResolvedValue('running');
    const result = await getVoiceServerStatus();
    expect(invoke).toHaveBeenCalledWith('voice_status');
    expect(result).toBe('running');
  });

  it('getVoiceWebSocketUrl returns saved URL when valid', () => {
    localStorageMock.getItem.mockReturnValue('ws://192.168.1.1:8765/ws');
    const url = getVoiceWebSocketUrl();
    expect(url).toBe('ws://192.168.1.1:8765/ws');
  });

  it('getVoiceWebSocketUrl returns default when no saved URL', () => {
    localStorageMock.getItem.mockReturnValue(null);
    const url = getVoiceWebSocketUrl();
    expect(url).toBe('ws://127.0.0.1:8766/ws');
  });

  it('getVoiceWebSocketUrl returns default when saved URL invalid', () => {
    localStorageMock.getItem.mockReturnValue('http://invalid.url');
    const url = getVoiceWebSocketUrl();
    expect(url).toBe('ws://127.0.0.1:8766/ws');
  });

  it('startVoiceWatchdog sets up interval and resets failure count', () => {
    startVoiceWatchdog();
    expect(setInterval).toHaveBeenCalled();
  });

  it('stopVoiceWatchdog clears interval', () => {
    stopVoiceWatchdog();
    expect(clearInterval).toHaveBeenCalled();
  });

  it('startVoiceWatchdog handles status check failures gracefully', async () => {
    invoke.mockRejectedValue(new Error('Server not reachable'));
    const toastHandler = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: toastHandler });
    startVoiceWatchdog();
    expect(setInterval).toHaveBeenCalled();
  });

  // QA 2026-10-22: the watchdog treated "never started" as "crashed" and
  // showed "Voice OS offline - restarting..." five times to every user.
  describe('watchdog', () => {
    beforeEach(() => {
      resetVoiceWatchdogState();
      invoke.mockReset();
      vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    });

    it('does nothing when Voice OS was never started', async () => {
      invoke.mockResolvedValue('stopped');
      for (let i = 0; i < 6; i++) await checkVoiceWatchdog();
      expect(window.dispatchEvent).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalledWith('voice_start');
    });

    it('restarts Voice OS when it was running and stopped', async () => {
      invoke.mockResolvedValueOnce('running');
      await checkVoiceWatchdog();
      invoke.mockResolvedValue('stopped');
      await checkVoiceWatchdog();
      expect(invoke).toHaveBeenCalledWith('voice_start');
      expect(window.dispatchEvent.mock.calls[0][0].detail.message).toMatch(/stopped unexpectedly/);
    });

    it('does not restart Voice OS after a deliberate Stop', async () => {
      invoke.mockResolvedValueOnce('running');
      await checkVoiceWatchdog();
      invoke.mockResolvedValue('stopped');
      await stopVoiceServer();
      await checkVoiceWatchdog();
      expect(invoke).not.toHaveBeenCalledWith('voice_start');
    });

    it('gives up after five attempts', async () => {
      invoke.mockResolvedValueOnce('running');
      await checkVoiceWatchdog();
      invoke.mockImplementation(async (cmd) => (cmd === 'voice_status' ? 'stopped' : null));
      for (let i = 0; i < 8; i++) await checkVoiceWatchdog();
      expect(invoke.mock.calls.filter(([c]) => c === 'voice_start')).toHaveLength(4);
      expect(window.dispatchEvent.mock.calls.at(-1)[0].detail.message).toMatch(/could not be restarted after 5 attempts/);
    });
  });
});
