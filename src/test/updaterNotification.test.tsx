import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn()
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
  stopTool: vi.fn()
}));

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getAllStatus, stopTool } from '../services/runtimeManagerService';
import { UpdaterNotification } from '../components/UpdaterNotification';

function makeUpdate(downloadAndInstall: ReturnType<typeof vi.fn>) {
  return { downloadAndInstall };
}

describe('UpdaterNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops every currently-running Runtime Hub tool before downloadAndInstall is called', async () => {
    vi.mocked(getAllStatus).mockResolvedValue([
      { name: 'ollama', running: true, installed: true },
      { name: 'comfyui', running: false, installed: true }
    ]);
    vi.mocked(stopTool).mockResolvedValue({ tool: 'ollama', ok: true, message: 'stopped' });
    const downloadAndInstall = vi.fn().mockImplementation(async (cb: any) => {
      cb({ event: 'Finished' });
    });
    vi.mocked(check).mockResolvedValue(makeUpdate(downloadAndInstall) as any);

    render(<UpdaterNotification version="2.8.0" onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download update/i }));

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalled());

    expect(stopTool).toHaveBeenCalledWith('ollama');
    expect(stopTool).not.toHaveBeenCalledWith('comfyui');
    // The stop must happen before the installer runs, not after or concurrently
    // with no ordering guarantee -- assert call order via mock invocation order.
    const stopOrder = vi.mocked(stopTool).mock.invocationCallOrder[0];
    const installOrder = downloadAndInstall.mock.invocationCallOrder[0];
    expect(stopOrder).toBeLessThan(installOrder);
  });

  it('does not call stopTool when nothing is running', async () => {
    vi.mocked(getAllStatus).mockResolvedValue([
      { name: 'ollama', running: false, installed: true }
    ]);
    const downloadAndInstall = vi.fn().mockImplementation(async (cb: any) => {
      cb({ event: 'Finished' });
    });
    vi.mocked(check).mockResolvedValue(makeUpdate(downloadAndInstall) as any);

    render(<UpdaterNotification version="2.8.0" onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download update/i }));

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalled());
    expect(stopTool).not.toHaveBeenCalled();
  });

  it('still proceeds with the update if getAllStatus itself fails (best-effort, not a hard dependency)', async () => {
    vi.mocked(getAllStatus).mockRejectedValue(new Error('runtime hub unavailable'));
    const downloadAndInstall = vi.fn().mockImplementation(async (cb: any) => {
      cb({ event: 'Finished' });
    });
    vi.mocked(check).mockResolvedValue(makeUpdate(downloadAndInstall) as any);

    render(<UpdaterNotification version="2.8.0" onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download update/i }));

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalled());
    expect(await screen.findByText(/relaunching/i)).toBeInTheDocument();
  });

  it('relaunches after a successful install', async () => {
    vi.mocked(getAllStatus).mockResolvedValue([]);
    const downloadAndInstall = vi.fn().mockImplementation(async (cb: any) => {
      cb({ event: 'Finished' });
    });
    vi.mocked(check).mockResolvedValue(makeUpdate(downloadAndInstall) as any);

    render(<UpdaterNotification version="2.8.0" onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download update/i }));

    await waitFor(() => expect(relaunch).toHaveBeenCalled());
  });
});
