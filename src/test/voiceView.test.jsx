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
  checkPrerequisites: vi.fn().mockResolvedValue({ pythonFound: true })
}));

describe('VoiceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows stopped status with a Start button when the voice server is not running', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('stopped');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/stopped/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
  });

  it('shows running status with a Stop button and the WebSocket URL when the voice server is running', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('running');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/running/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    expect(screen.getByText(/ws:\/\/127\.0\.0\.1:8766\/ws/i)).toBeInTheDocument();
  });

  it('calls startVoiceServer and refreshes status when Start is clicked', async () => {
    const { getVoiceServerStatus, startVoiceServer } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValueOnce('stopped').mockResolvedValueOnce('running');
    startVoiceServer.mockResolvedValue('started');

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    await screen.findByRole('button', { name: /^start$/i });
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    await waitFor(() => expect(startVoiceServer).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /^stop$/i })).toBeInTheDocument();
  });

  it('warns when Python was not detected as a prerequisite', async () => {
    const { getVoiceServerStatus } = await import('../services/voiceOsService');
    getVoiceServerStatus.mockResolvedValue('stopped');
    const { checkPrerequisites } = await import('../services/runtimeManagerService');
    checkPrerequisites.mockResolvedValue({ pythonFound: false });

    const { VoiceView } = await import('../components/VoiceView');
    render(<VoiceView />);

    expect(await screen.findByText(/python.*not.*(found|detected)/i)).toBeInTheDocument();
  });
});
