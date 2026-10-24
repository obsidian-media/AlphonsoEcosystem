// Phase 4c: choosing a scene's motion — Miya's suggestion, a preset, a recording or a file.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { MotionPicker } from '../../../components/miya/MotionPicker';
import { MOTION_CAMERA_REFUSED } from '../../../services/contentFactory/contentMotion';

const handlers = () => ({ onSet: vi.fn(), onClip: vi.fn(async () => ({ ok: true, path: 'b/p/motion/s1-v1.mp4' })), onDismissSuggestion: vi.fn() });

afterEach(() => { vi.useRealTimers(); delete (navigator as any).mediaDevices; delete (globalThis as any).MediaRecorder; });
beforeEach(() => { vi.clearAllMocks(); });

describe('MotionPicker', () => {
  it("shows Miya's suggestion, which you can turn off", () => {
    const h = handlers();
    render(<MotionPicker label="Scene 1" motion={null} suggested {...h} />);
    expect(screen.getByText('Miya suggests a move here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not here' }));
    expect(h.onDismissSuggestion).toHaveBeenCalled();
  });

  it('saves a Higgsfield preset id, or none', () => {
    const h = handlers();
    render(<MotionPicker label="Scene 1" motion={null} {...h} />);
    fireEvent.change(screen.getByLabelText('Motion: Scene 1'), { target: { value: 'preset' } });
    fireEvent.change(screen.getByLabelText('Preset id: Scene 1'), { target: { value: 'wave-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this preset' }));
    expect(h.onSet).toHaveBeenCalledWith({ source: 'preset', presetId: 'wave-01' });
    fireEvent.change(screen.getByLabelText('Motion: Scene 1'), { target: { value: 'none' } });
    expect(h.onSet).toHaveBeenLastCalledWith(null);
  });

  it('chooses a file through the backend', async () => {
    const h = handlers();
    render(<MotionPicker label="Scene 1" motion={null} {...h} />);
    fireEvent.change(screen.getByLabelText('Motion: Scene 1'), { target: { value: 'file' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a video…' }));
    await waitFor(() => expect(h.onClip).toHaveBeenCalledWith({ choose: true }));
  });

  it('a refused camera says what to do', async () => {
    (navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => { throw new Error('NotAllowedError'); }) };
    render(<MotionPicker label="Scene 1" motion={null} {...handlers()} />);
    fireEvent.change(screen.getByLabelText('Motion: Scene 1'), { target: { value: 'record' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText(MOTION_CAMERA_REFUSED)).toBeTruthy();
  });

  it('records after 3-2-1, stops by itself at 10 seconds, and keeps the clip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const stopTrack = vi.fn();
    (navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) };
    class FakeRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      state = 'inactive';
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['WEBM'], { type: 'video/webm' }) }); this.onstop?.(); }
    }
    (globalThis as any).MediaRecorder = FakeRecorder;
    const h = handlers();
    render(<MotionPicker label="Scene 1" motion={null} {...h} />);
    fireEvent.change(screen.getByLabelText('Motion: Scene 1'), { target: { value: 'record' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record' })); });
    expect(screen.getByText('3')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Recording/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(stopTrack).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep' })); });
    expect(h.onClip).toHaveBeenCalledWith({ base64: expect.any(String) });
  });
});
