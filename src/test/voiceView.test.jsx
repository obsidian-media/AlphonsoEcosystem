import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/voiceOsService', () => ({
  getVoiceServerStatus: vi.fn(),
  startVoiceServer: vi.fn(),
  stopVoiceServer: vi.fn(),
  getVoiceWebSocketUrl: vi.fn(() => 'ws://127.0.0.1:8766/ws')
}));

vi.mock('../services/runtimeManagerService', () => ({
  checkPrerequisites: vi.fn().mockResolvedValue({ pythonFound: true }),
  getAllStatus: vi.fn().mockResolvedValue([{ name: 'voice-os', installed: true, running: false }])
}));

describe('VoiceView', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { checkPrerequisites, getAllStatus } = await import('../services/runtimeManagerService');
    checkPrerequisites.mockResolvedValue({ pythonFound: true });
    getAllStatus.mockResolvedValue([{ name: 'voice-os', installed: true, running: false }]);
  });

  it('shows stopped status with a Start button when the voice server is not running', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('stopped');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/local voice offline/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start local voice/i })).toBeInTheDocument();
    expect(screen.getByText(/Voice OS runtime/i)).toBeInTheDocument();
  });

  it('shows running status with a Stop button and the WebSocket URL when the voice server is running', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('running');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/running/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop local voice/i })).toBeInTheDocument();
    expect(screen.getByText(/ws:\/\/127\.0\.0\.1:8766\/ws/i)).toBeInTheDocument();
  });

  it('calls startVoiceServer and refreshes status when Start is clicked', async () => {
    const { getVoiceServerStatus, startVoiceServer } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValueOnce('stopped').mockResolvedValueOnce('running');
    startVoiceServer.mockResolvedValue('started');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    await screen.findByRole('button', { name: /start local voice/i });
    fireEvent.click(screen.getByRole('button', { name: /start local voice/i }));

    await waitFor(() => expect(startVoiceServer).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /stop local voice/i })).toBeInTheDocument();
  });

  it('warns when Python was not detected as a prerequisite', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('stopped');
    const { checkPrerequisites } = await import('../services/runtimeManagerService');
    checkPrerequisites.mockResolvedValue({ pythonFound: false });

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/python.*not.*(found|detected)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start local voice/i })).toBeDisabled();
  });

  it('requires the managed Voice OS runtime before enabling local start', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    const { checkPrerequisites, getAllStatus } = await import('../services/runtimeManagerService');
    getVoiceServerStatus.mockResolvedValue('stopped');
    checkPrerequisites.mockResolvedValue({ pythonFound: true });
    getAllStatus.mockResolvedValue([]);

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/Install Voice OS from Runtimes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start local voice/i })).toBeDisabled();
  });

  it('does not crash when getAllStatus resolves null (outside Tauri, e.g. plain browser dev mode)', async () => {
    // Regression for a real QA-reported crash: `window.__TAURI_INTERNALS__.invoke`
    // resolves `Promise.resolve(null)` for every command outside a real Tauri
    // webview (see index.html), so tools.value.find(...) threw
    // "Cannot read properties of null (reading 'find')" and locked the whole
    // app behind the boot-error overlay. getAllStatus() itself no longer
    // resolves null (guarded in runtimeManagerService.ts), but this asserts
    // VoiceView also degrades gracefully if a null ever reaches it.
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    const { checkPrerequisites, getAllStatus } = await import('../services/runtimeManagerService');
    getVoiceServerStatus.mockResolvedValue('stopped');
    checkPrerequisites.mockResolvedValue({ pythonFound: true });
    getAllStatus.mockResolvedValue(null);

    const { VoiceView } = await import('../components/VoiceView');
    expect(() => render(<VoiceView />)).not.toThrow();

    expect(await screen.findByText(/Checking the managed runtime/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start local voice/i })).toBeDisabled();
  });

  it('keeps Cloud Voice explicitly pending until physical-device verification', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('stopped');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/Physical-device verification pending/i)).toBeInTheDocument();
  });
});
