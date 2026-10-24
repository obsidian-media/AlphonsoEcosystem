// Phase 4c: Runtime Hub → ComfyUI: the character reference model, so characters stay free on this computer.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getCharacterReferenceModel = vi.fn();
const installCharacterReferenceModel = vi.fn();
vi.mock('../../services/videoModelService', () => ({
  getCharacterReferenceModel: () => getCharacterReferenceModel(),
  installCharacterReferenceModel: () => installCharacterReferenceModel(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => undefined) }));

import { CharacterReferencePanel } from '../../components/CharacterReferencePanel';

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
