import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Owner, 2026-10-22: there must be a place to choose the image model, the way
// the chat model is chosen. Before this the app read a saved choice that
// nothing in the UI could set.

const mockList = vi.fn();
vi.mock('../../services/connectors/connectorImageGenerators.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/connectors/connectorImageGenerators.js');
  return { ...actual, listComfyUiCheckpoints: (...a: unknown[]) => mockList(...a) };
});

import { ComfyUiModelPicker } from '../../components/ComfyUiModelPicker';
import { getSelectedComfyUiCheckpoint, pickAutomaticCheckpoint } from '../../services/connectors/connectorImageGenerators.js';

describe('ComfyUiModelPicker', () => {
  beforeEach(() => {
    localStorage.clear();
    mockList.mockReset();
  });

  it("lists ComfyUI's models and saves the one chosen", async () => {
    mockList.mockResolvedValue({ ok: true, models: ['DreamShaper_8_pruned.safetensors', 'v1-5-pruned-emaonly-fp16.safetensors'] });
    render(<ComfyUiModelPicker />);
    const select = await screen.findByLabelText('Image model');
    expect(screen.getByRole('option', { name: 'Automatic (v1-5-pruned-emaonly-fp16.safetensors)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'DreamShaper_8_pruned.safetensors' } });
    expect(getSelectedComfyUiCheckpoint()).toBe('DreamShaper_8_pruned.safetensors');
    fireEvent.change(select, { target: { value: '' } });
    expect(getSelectedComfyUiCheckpoint()).toBe('');
  });

  it("says ComfyUI isn't running instead of showing an empty list", async () => {
    mockList.mockResolvedValue({ ok: false, models: [], error: 'connection refused' });
    render(<ComfyUiModelPicker />);
    expect(await screen.findByText(/ComfyUI isn't running, so its models can't be listed/)).toBeTruthy();
    expect(screen.queryByLabelText('Image model')).toBeNull();
  });

  it('tells the user where to put a model when ComfyUI has none', async () => {
    mockList.mockResolvedValue({ ok: true, models: [] });
    render(<ComfyUiModelPicker />);
    expect(await screen.findByText(/has no image models yet/)).toBeTruthy();
  });

  it('warns when the saved model is no longer in ComfyUI', async () => {
    localStorage.setItem('alphonso_comfyui_checkpoint_v1', 'removed_model.safetensors');
    mockList.mockResolvedValue({ ok: true, models: ['DreamShaper_8_pruned.safetensors'] });
    render(<ComfyUiModelPicker />);
    expect(await screen.findByText(/isn't in ComfyUI any more; Automatic is used/)).toBeTruthy();
  });
});

describe('pickAutomaticCheckpoint', () => {
  it('prefers the starter model, then the fallback, then the first listed', () => {
    expect(pickAutomaticCheckpoint(['a.safetensors', 'v1-5-pruned-emaonly-fp16.safetensors'])).toBe('v1-5-pruned-emaonly-fp16.safetensors');
    expect(pickAutomaticCheckpoint(['a.safetensors', 'DreamShaper_8_pruned.safetensors'])).toBe('DreamShaper_8_pruned.safetensors');
    expect(pickAutomaticCheckpoint(['a.safetensors'])).toBe('a.safetensors');
    expect(pickAutomaticCheckpoint([])).toBe('');
  });
});
