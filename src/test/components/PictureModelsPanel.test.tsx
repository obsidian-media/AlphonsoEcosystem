// Owner, 2026-11-02: "where could I download a better image model from inside Alphonso?" Runtime
// Hub's ComfyUI card offers pinned picture models; one installed is used for pictures.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => undefined) }));
const models = [
  { id: 'sdxl_lightning_4step', name: 'SDXL Lightning (4 steps)', minVramGb: 6, license: 'CreativeML Open RAIL++-M', sizeBytes: 6_938_040_682, installed: false, vramGb: 6, comfyuiDir: 'D:/ComfyUI', fileNames: ['sdxl_lightning_4step.safetensors'] },
  { id: 'dreamshaper_xl_lightning', name: 'DreamShaper XL Lightning', minVramGb: 6, license: 'CreativeML Open RAIL++-M', sizeBytes: 6_939_220_250, installed: true, vramGb: 6, comfyuiDir: 'D:/ComfyUI', fileNames: ['DreamShaperXL_Lightning-SFW.safetensors'] },
];
const listPictureModels = vi.fn();
const installPictureModel = vi.fn(async (_id: string) => undefined);
vi.mock('../../services/videoModelService', () => ({
  listPictureModels: () => listPictureModels(),
  installPictureModel: (id: string) => installPictureModel(id),
}));
let chosen = '';
const setSelectedComfyUiCheckpoint = vi.fn((name: string) => { chosen = name; });
vi.mock('../../services/connectors/connectorImageGenerators', () => ({
  getSelectedComfyUiCheckpoint: () => chosen,
  setSelectedComfyUiCheckpoint: (name: string) => setSelectedComfyUiCheckpoint(name),
}));

const { PictureModelsPanel } = await import('../../components/PictureModelsPanel');

beforeEach(() => {
  chosen = '';
  setSelectedComfyUiCheckpoint.mockClear();
  installPictureModel.mockClear();
  listPictureModels.mockReset().mockResolvedValue(models.map((m) => ({ ...m })));
});

describe('PictureModelsPanel', () => {
  it('lists each picture model with its size, memory and licence', async () => {
    render(<PictureModelsPanel />);
    expect(await screen.findByText('SDXL Lightning (4 steps)')).toBeTruthy();
    expect(screen.getByText('DreamShaper XL Lightning')).toBeTruthy();
    expect(screen.getAllByText(/6\.9 GB · needs about 6 GB of graphics memory · CreativeML Open RAIL\+\+-M/)).toHaveLength(2);
  });

  it('installs one and then uses it for pictures', async () => {
    listPictureModels.mockResolvedValueOnce(models.map((m) => ({ ...m })))
      .mockResolvedValue(models.map((m) => (m.id === 'sdxl_lightning_4step' ? { ...m, installed: true } : { ...m })));
    render(<PictureModelsPanel />);
    fireEvent.click(await screen.findByTestId('picture-model-install-sdxl_lightning_4step'));
    await waitFor(() => expect(installPictureModel).toHaveBeenCalledWith('sdxl_lightning_4step'));
    await waitFor(() => expect(setSelectedComfyUiCheckpoint).toHaveBeenCalledWith('sdxl_lightning_4step.safetensors'));
    expect(await screen.findByTestId('picture-model-in-use-sdxl_lightning_4step')).toBeTruthy();
  });

  it('an installed model not in use can be chosen; the one in use says so', async () => {
    render(<PictureModelsPanel />);
    fireEvent.click(await screen.findByTestId('picture-model-use-dreamshaper_xl_lightning'));
    expect(setSelectedComfyUiCheckpoint).toHaveBeenCalledWith('DreamShaperXL_Lightning-SFW.safetensors');
    expect(await screen.findByTestId('picture-model-in-use-dreamshaper_xl_lightning')).toBeTruthy();
  });

  it('a failed install says why and changes nothing', async () => {
    installPictureModel.mockRejectedValueOnce(new Error('The download did not match its checksum.'));
    render(<PictureModelsPanel />);
    fireEvent.click(await screen.findByTestId('picture-model-install-sdxl_lightning_4step'));
    expect(await screen.findByText('The download did not match its checksum.')).toBeTruthy();
    expect(setSelectedComfyUiCheckpoint).not.toHaveBeenCalled();
  });
});
