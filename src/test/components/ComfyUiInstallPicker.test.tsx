import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// QA Bug 31 (2026-10-22): the user picks which of their ComfyUI installs
// Alphonso uses, from the installs found on the machine.

const mockFind = vi.fn();
vi.mock('../../services/comfyuiSettingsService', () => ({
  findComfyuiInstalls: (...a: unknown[]) => mockFind(...a),
}));

import { ComfyUiInstallPicker } from '../../components/ComfyUiInstallPicker';

const found = [
  { path: 'D:\\Running\\ComfyUI', python: 'D:\\Running\\venv\\Scripts\\python.exe', running: true, sources: ['running'], checkpoints: 2, alphonsoCopy: false },
  { path: 'E:\\Other\\ComfyUI', python: null, running: false, sources: ['usual-place'], checkpoints: 0, alphonsoCopy: false },
];

describe('ComfyUiInstallPicker', () => {
  beforeEach(() => mockFind.mockReset());

  it('lists the installs found and saves the chosen folder with its Python', async () => {
    mockFind.mockResolvedValue(found);
    const onChoose = vi.fn();
    render(<ComfyUiInstallPicker comfyuiDir={'D:\\Running\\ComfyUI'} onChoose={onChoose} />);
    const select = await screen.findByLabelText('ComfyUI install');
    expect(screen.getByRole('option', { name: 'D:\\Running\\ComfyUI (running, 2 image models)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'E:\\Other\\ComfyUI (0 image models, Python not found)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'E:\\Other\\ComfyUI' } });
    expect(onChoose).toHaveBeenCalledWith('E:\\Other\\ComfyUI', '');
    expect(mockFind).toHaveBeenCalledWith('D:\\Running\\ComfyUI');
  });

  it('says when the saved folder is not a ComfyUI install it can find', async () => {
    mockFind.mockResolvedValue(found);
    render(<ComfyUiInstallPicker comfyuiDir={'Z:\\Gone'} onChoose={vi.fn()} />);
    expect(await screen.findByRole('option', { name: 'Z:\\Gone (not found as a ComfyUI install)' })).toBeTruthy();
  });

  it('says what to do when no ComfyUI is found', async () => {
    mockFind.mockResolvedValue([]);
    render(<ComfyUiInstallPicker comfyuiDir="" onChoose={vi.fn()} />);
    expect(await screen.findByText(/No ComfyUI found\. Install it from Runtime Hub, or enter its folder below\./)).toBeTruthy();
  });
});
