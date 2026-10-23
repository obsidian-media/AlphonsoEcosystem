import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let progressHandler: ((e: { payload: unknown }) => void) | null = null;
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, handler: (e: { payload: unknown }) => void) => { progressHandler = handler; return () => undefined; }),
}));
vi.mock('../../services/videoModelService', async () => {
  const actual = await vi.importActual<typeof import('../../services/videoModelService')>('../../services/videoModelService');
  return { ...actual, listVideoModels: vi.fn(), installVideoModel: vi.fn(async () => undefined) };
});

import { installVideoModel, listVideoModels, getSelectedVideoModel } from '../../services/videoModelService';
import { VideoModelsPanel } from '../../components/VideoModelsPanel';

const info = {
  vramGb: 6, suggested: 'ltx_video_2b', comfyuiDir: 'D:\\ComfyUI',
  models: [
    { id: 'ltx_video_2b', name: 'LTX-Video 2B (fast, for smaller cards)', minVramGb: 6, maxSeconds: 5, fps: 24, license: 'LTX-Video Open Weights License', sizeBytes: 9_355_630_588, installed: false },
    { id: 'wan22_ti2v_5b', name: 'Wan 2.2 5B (better motion, 8 GB or more)', minVramGb: 8, maxSeconds: 5, fps: 24, license: 'Apache License 2.0', sizeBytes: 18_144_966_705, installed: true },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(listVideoModels).mockResolvedValue(info);
  vi.mocked(installVideoModel).mockClear();
});

// Miya content factory phase 2b: Runtime Hub suggests a video model by the card.
describe('VideoModelsPanel', () => {
  it('lists each model with its memory, size and license, and marks the one suggested for this card', async () => {
    render(<VideoModelsPanel />);
    await waitFor(() => expect(screen.getByText('LTX-Video 2B (fast, for smaller cards)')).toBeTruthy());
    expect(screen.getByText(/Your card: 6 GB/)).toBeTruthy();
    expect(screen.getByText('Suggested for your card')).toBeTruthy();
    expect(screen.getByText(/needs 8 GB/)).toBeTruthy();
    expect(screen.getByText(/9\.4 GB download/)).toBeTruthy();
    expect(screen.getByText('Apache License 2.0')).toBeTruthy();
  });

  it('installs a model, and choosing another one is remembered', async () => {
    render(<VideoModelsPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install LTX-Video 2B (fast, for smaller cards)' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Install LTX-Video 2B (fast, for smaller cards)' }));
    expect(installVideoModel).toHaveBeenCalledWith('ltx_video_2b');
    fireEvent.click(screen.getByRole('radio', { name: /Wan 2\.2 5B/ }));
    expect(getSelectedVideoModel()).toBe('wan22_ti2v_5b');
  });

  it('shows the download progress for video models only', async () => {
    const { act } = await import('@testing-library/react');
    render(<VideoModelsPanel />);
    await waitFor(() => expect(progressHandler).toBeTruthy());
    act(() => { progressHandler!({ payload: { tool: 'comfyui', stage: 'x', message: 'Not ours', pct: 10 } }); });
    expect(screen.queryByText('Not ours')).toBeNull();
    act(() => { progressHandler!({ payload: { tool: 'comfyui-video', stage: 'downloading_model', message: 'Downloading Wan… 5 of 10 MB', pct: 25 } }); });
    expect(screen.getByText('Downloading Wan… 5 of 10 MB')).toBeTruthy();
  });

  it('says so when there is no NVIDIA card', async () => {
    vi.mocked(listVideoModels).mockResolvedValue({ ...info, vramGb: null, suggested: null });
    render(<VideoModelsPanel />);
    await waitFor(() => expect(screen.getByText(/No NVIDIA graphics card was found/)).toBeTruthy());
  });
});
