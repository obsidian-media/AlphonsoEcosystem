// Phase 4c: Runtime Hub → ComfyUI: the character reference model, so characters stay free on this computer.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getCharacterReferenceModel = vi.fn();
const installCharacterReferenceModel = vi.fn();
const getLocalMotionModel = vi.fn();
const installLocalMotionModel = vi.fn();
vi.mock('../../services/videoModelService', () => ({
  getCharacterReferenceModel: () => getCharacterReferenceModel(),
  installCharacterReferenceModel: () => installCharacterReferenceModel(),
  getLocalMotionModel: () => getLocalMotionModel(),
  installLocalMotionModel: () => installLocalMotionModel(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => undefined) }));

import { CharacterReferencePanel, MotionTransferPanel } from '../../components/CharacterReferencePanel';

const info = (installed: boolean) => ({ id: 'sd21_unclip_l', name: 'Character reference (Stable Diffusion 2.1 unCLIP)', minVramGb: 4, license: 'CreativeML Open RAIL++-M', sizeBytes: 6_161_550_731, installed, vramGb: 6, comfyuiDir: 'D:\\ComfyUI' });

beforeEach(() => { vi.clearAllMocks(); });

describe('CharacterReferencePanel', () => {
  it('offers to install the model, with its size and licence, and shows it installed after', async () => {
    getCharacterReferenceModel.mockResolvedValueOnce(info(false)).mockResolvedValue(info(true));
    installCharacterReferenceModel.mockResolvedValue(undefined);
    render(<CharacterReferencePanel />);
    expect(await screen.findByText('Character reference (Stable Diffusion 2.1 unCLIP)')).toBeTruthy();
    expect(screen.getByText(/6\.2 GB/)).toBeTruthy();
    expect(screen.getByText(/CreativeML Open RAIL\+\+-M/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(installCharacterReferenceModel).toHaveBeenCalled());
    expect(await screen.findByText('Installed')).toBeTruthy();
  });

  it('says the install failed, in plain words', async () => {
    getCharacterReferenceModel.mockResolvedValue(info(false));
    installCharacterReferenceModel.mockRejectedValue(new Error('No ComfyUI was found. Install it in Runtime Hub or choose yours in Settings.'));
    render(<CharacterReferencePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(await screen.findByText('No ComfyUI was found. Install it in Runtime Hub or choose yours in Settings.')).toBeTruthy();
  });
});

describe('MotionTransferPanel', () => {
  const motion = (over: Record<string, unknown>) => ({ id: 'wan21_vace_1_3b', name: 'Motion transfer (Wan 2.1 VACE 1.3B)', minVramGb: 8, license: 'Apache-2.0', sizeBytes: 11_299_242_015, installed: false, vramGb: 12, comfyuiDir: 'D:\\ComfyUI', ...over });

  it('offers to install motion transfer, and installs it', async () => {
    getLocalMotionModel.mockResolvedValueOnce(motion({})).mockResolvedValue(motion({ installed: true }));
    installLocalMotionModel.mockResolvedValue(undefined);
    render(<MotionTransferPanel />);
    expect(await screen.findByText('Motion transfer (Wan 2.1 VACE 1.3B)')).toBeTruthy();
    expect(screen.getByText(/11\.3 GB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(installLocalMotionModel).toHaveBeenCalled());
    expect(await screen.findByText('Installed')).toBeTruthy();
  });

  it("says a card too small can't run it, and offers no install", async () => {
    getLocalMotionModel.mockResolvedValue(motion({ vramGb: 6 }));
    render(<MotionTransferPanel />);
    expect(await screen.findByText("This graphics card can't run local motion transfer; Higgsfield can.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});
