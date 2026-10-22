import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const mockGetAllStatus = vi.fn();
const mockCheckPrerequisites = vi.fn();
const mockOnAnyProgress = vi.fn();

vi.mock('../services/runtimeManagerService', () => ({
  getAllStatus: (...args: unknown[]) => mockGetAllStatus(...args),
  checkPrerequisites: (...args: unknown[]) => mockCheckPrerequisites(...args),
  getAutostartPrefs: vi.fn(),
  installPrerequisite: vi.fn(),
  installTool: vi.fn(),
  onAnyProgress: (...args: unknown[]) => mockOnAnyProgress(...args),
  onLogLine: vi.fn(),
  saveAutostartPref: vi.fn(),
  startTool: vi.fn(),
  stopTool: vi.fn(),
}));

vi.mock('../services/moduleRegistryService', () => ({
  listModules: vi.fn().mockReturnValue([]),
  enableModule: vi.fn(),
  disableModule: vi.fn(),
}));

vi.mock('../services/policyDslService', () => ({
  loadPolicy: vi.fn().mockResolvedValue(null),
  getPolicyRules: vi.fn().mockReturnValue([]),
}));

const mockOpenExternalUrl = vi.fn();
vi.mock('../services/browserAutomationService', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock('../components/AgentActivityLog', () => ({
  AgentActivityLog: () => <div data-testid="activity-log" />,
}));

import RuntimeManagerView from '../components/RuntimeManagerView';

const runtimeNames = [
  'ollama',
  'comfyui',
  'automatic1111',
  'fooocus',
  'invokeai',
  'whisper',
  'audiocraft',
  'voice-os',
  'openwebui',
  'mcp-server',
  'alphonso-bridge',
  'chromadb',
  'openHands',
  'n8n',
].map((name) => ({
  name,
  displayName:
    name === 'voice-os' ? 'Voice OS'
      : name === 'openwebui' ? 'Open WebUI'
      : name === 'mcp-server' ? 'MCP Server'
      : name === 'alphonso-bridge' ? 'Alphonso Bridge'
      : name === 'chromadb' ? 'ChromaDB'
      : name === 'openHands' ? 'OpenHands'
      : name === 'audiocraft' ? 'AudioCraft / MusicGen'
      : name === 'automatic1111' ? 'AUTOMATIC1111 WebUI'
      : name === 'fooocus' ? 'Fooocus'
      : name === 'invokeai' ? 'InvokeAI'
      : name === 'comfyui' ? 'ComfyUI'
      : name === 'whisper' ? 'Whisper'
      : name === 'n8n' ? 'n8n'
      : 'Ollama',
  description: `${name} runtime`,
  installed: true,
  running: name === 'ollama' || name === 'fooocus',
  port: 1234,
  installDir: `D:\\Alphonso\\runtimes\\${name}`,
  autoStart: false,
  repoUrl: null,
}));

describe('RuntimeManagerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllStatus.mockResolvedValue(runtimeNames);
    mockCheckPrerequisites.mockResolvedValue({ missing: [], installHint: 'ok' });
    mockOnAnyProgress.mockResolvedValue(() => {});
  });

  it('renders the runtime catalog entries that were previously untested', async () => {
    render(<RuntimeManagerView />);
    for (const name of ['Open WebUI', 'MCP Server', 'Alphonso Bridge', 'ChromaDB', 'OpenHands', 'Voice OS', 'AudioCraft / MusicGen']) {
      expect(await screen.findByText(name)).toBeTruthy();
    }
  });

  it('renders the core image and local runtime entries together', async () => {
    render(<RuntimeManagerView />);
    for (const name of ['ComfyUI', 'AUTOMATIC1111 WebUI', 'Fooocus', 'InvokeAI', 'Whisper', 'n8n', 'Ollama']) {
      expect(await screen.findByText(name)).toBeTruthy();
    }
  });

  // Owner, 2026-10-22: each tool says who uses it and how it differs, so a
  // user can tell e.g. ComfyUI (used by Miya) from Fooocus (standalone).
  it('says which tools agents use and which are standalone', async () => {
    render(<RuntimeManagerView />);
    const comfy = await screen.findByTestId('runtime-tool-note-comfyui');
    expect(comfy.textContent).toMatch(/Used by: Miya Studio and Content Studio/);
    const fooocus = await screen.findByTestId('runtime-tool-note-fooocus');
    expect(fooocus.textContent).toMatch(/Standalone/);
    for (const name of runtimeNames.map((t) => t.name)) {
      expect(await screen.findByTestId(`runtime-tool-note-${name}`)).toBeTruthy();
    }
  });

  // Bare <a target="_blank"> does nothing in the desktop window, and Open UI
  // was offered for background services with no page (Ollama).
  it('opens a running tool through the backend, and only tools with a web page', async () => {
    render(<RuntimeManagerView />);
    const fooocus = await screen.findByTestId('runtime-tool-fooocus');
    fireEvent.click(within(fooocus).getByText(/Open UI/));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:1234');
    const ollama = await screen.findByTestId('runtime-tool-ollama');
    expect(within(ollama).queryByText(/Open UI/)).toBeNull();
  });
});
