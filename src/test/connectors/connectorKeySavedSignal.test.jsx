// QA batch 1, live check: a key saved in Settings left Chat's NVIDIA tab greyed out. Chat stays
// mounted, and its provider tabs re-read saved keys only when the window got focus back, which
// never happens inside the one app window. Saving a key now says so, and the tabs re-check.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ ok: true })) }));

let nvidiaSaved = false;
vi.mock('../../services/connectors/nvidiaNimConnector', () => ({
  isNvidiaConfigured: vi.fn(() => nvidiaSaved),
  findWorkingNvidiaModel: vi.fn(async () => ({ model: null, notServed: [] })),
  nvidiaModelsNotServed: vi.fn(() => []),
}));
vi.mock('../../services/connectors/geminiConnector', () => ({ isGeminiConfigured: vi.fn(() => false) }));
vi.mock('../../services/modelSelectionService', () => ({ getCloudModelList: vi.fn(async () => []) }));

const { saveConnectorCredential, onConnectorCredentialsChanged } = await import('../../services/connectors/connectorAuth');
const { ModelProviderPicker } = await import('../../components/ModelSwitcher');

describe('a key saved in Settings', () => {
  it('tells whoever listens which connector changed', () => {
    const heard = [];
    const stop = onConnectorCredentialsChanged((id) => heard.push(id));
    saveConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY', 'nvapi-test');
    stop();
    saveConnectorCredential('gemini', 'GEMINI_API_KEY', 'test');
    expect(heard).toEqual(['nvidia_nim']);
  });

  it("turns on Chat's NVIDIA tab without the window losing focus", async () => {
    nvidiaSaved = false;
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div />} />);
    const tab = () => screen.getByText('NVIDIA NIM').closest('button');
    await waitFor(() => expect(tab()).toBeDisabled());
    nvidiaSaved = true;
    act(() => saveConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY', 'nvapi-test'));
    await waitFor(() => expect(tab()).not.toBeDisabled());
  });
});
