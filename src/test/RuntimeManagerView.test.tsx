import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const mockGetAllStatus = vi.fn();
const mockCheckPrerequisites = vi.fn();
const mockOnAnyProgress = vi.fn();
const mockInstallTool = vi.fn();
const mockGetInstallLocation = vi.fn();

vi.mock('../services/runtimeManagerService', () => ({
  getAllStatus: (...args: unknown[]) => mockGetAllStatus(...args),
  checkPrerequisites: (...args: unknown[]) => mockCheckPrerequisites(...args),
  getAutostartPrefs: vi.fn(),
  installPrerequisite: vi.fn(),
  installTool: (...args: unknown[]) => mockInstallTool(...args),
  getInstallLocation: (...args: unknown[]) => mockGetInstallLocation(...args),
  setInstallLocation: vi.fn(),
  onAnyProgress: (...args: unknown[]) => mockOnAnyProgress(...args),
  onLogLine: vi.fn(async () => () => {}),
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

const mockFindComfy = vi.fn().mockResolvedValue([]);
vi.mock('../services/comfyuiSettingsService', () => ({
  findComfyuiInstalls: (...args: unknown[]) => mockFindComfy(...args),
}));
const mockTauriInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockTauriInvoke(...args),
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
  'chromadb',
  'openHands',
  'n8n',
].map((name) => ({
  name,
  displayName:
    name === 'voice-os' ? 'Voice OS'
      : name === 'openwebui' ? 'Open WebUI'
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
    mockGetInstallLocation.mockResolvedValue({ chosen: 'D:/Tools', effective: 'D:/Tools/Alphonso-runtimes', freeGb: 100, suggested: 'D:/Alphonso' });
  });

  it('renders the runtime catalog entries that were previously untested', async () => {
    render(<RuntimeManagerView />);
    for (const name of ['Open WebUI', 'ChromaDB', 'OpenHands', 'Voice OS', 'AudioCraft / MusicGen']) {
      expect(await screen.findByText(name)).toBeTruthy();
    }
  });

  // Closing phase (owner, 2026-10-30): a Mac has no bundled ffmpeg, so Runtime Hub says how to get it.
  it('says how to get ffmpeg when this computer has none', async () => {
    mockTauriInvoke.mockImplementation(async (cmd: string) => (cmd === 'media_tools_status'
      ? { ffmpeg: null, ffmpegHelp: 'Install it with Homebrew (brew.sh): open Terminal and run brew install ffmpeg, then try again.' }
      : null));
    render(<RuntimeManagerView />);
    const note = await screen.findByTestId('runtime-ffmpeg-missing');
    expect(note.textContent).toMatch(/ffmpeg isn't installed/);
    expect(note.textContent).toMatch(/brew install ffmpeg/);
  });

  it('says nothing about ffmpeg when it is there', async () => {
    mockTauriInvoke.mockImplementation(async (cmd: string) => (cmd === 'media_tools_status' ? { ffmpeg: 'C:/ffmpeg.exe' } : null));
    render(<RuntimeManagerView />);
    await screen.findByText('ComfyUI');
    expect(screen.queryByTestId('runtime-ffmpeg-missing')).toBeNull();
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

  // Hermes gateway (2026-10-30): Hermes has no web page; it says which agents use it.
  it('lists Hermes as used by Hermes-profile agents, with no web page', async () => {
    mockGetAllStatus.mockResolvedValue([
      ...runtimeNames,
      { ...runtimeNames[0], name: 'hermes-agent', displayName: 'Hermes Agent', running: true },
    ]);
    render(<RuntimeManagerView />);
    const note = await screen.findByTestId('runtime-tool-note-hermes-agent');
    expect(note.textContent).toMatch(/Used by: .*Hermes profile/);
    const card = await screen.findByTestId('runtime-tool-hermes-agent');
    expect(within(card).queryByText(/Open UI/)).toBeNull();
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

  // QA Bug 31 (2026-10-22): a user with their own ComfyUI saw "not installed"
  // and was offered only a second copy.
  it("uses the user's own ComfyUI when Alphonso has no copy, and starts it", async () => {
    mockGetAllStatus.mockResolvedValue(runtimeNames.map((t) => t.name === 'comfyui' ? { ...t, installed: false, running: false } : t));
    mockFindComfy.mockResolvedValue([
      { path: 'D:/Mine/ComfyUI', python: 'D:/Mine/venv/Scripts/python.exe', running: false, sources: ['settings'], checkpoints: 2, alphonsoCopy: false },
    ]);
    mockTauriInvoke.mockResolvedValue({ message: 'ComfyUI launched.' });
    render(<RuntimeManagerView />);
    const card = await screen.findByTestId('runtime-tool-comfyui');
    expect((await within(card).findByTestId('runtime-tool-existing-comfyui')).textContent).toContain('Using your ComfyUI: D:/Mine/ComfyUI · 2 image models');
    expect(within(card).getByText(/Install a separate copy/)).toBeTruthy();
    fireEvent.click(within(card).getByText('Start'));
    await vi.waitFor(() => expect(mockTauriInvoke).toHaveBeenCalledWith('launch_comfyui', { comfyuiDir: 'D:/Mine/ComfyUI', pythonExe: 'D:/Mine/venv/Scripts/python.exe' }));
  });

  // Owner, 2026-10-22: the user chooses where tools are installed before the
  // first install; nothing is hardcoded.
  it('asks where to install tools before the first install, instead of installing', async () => {
    mockGetAllStatus.mockResolvedValue(runtimeNames.map((t) => t.name === 'whisper' ? { ...t, installed: false, running: false } : t));
    mockGetInstallLocation.mockResolvedValue({ chosen: null, effective: 'C:/AppData/Alphonso/runtimes', freeGb: 13, suggested: 'D:/Alphonso' });
    render(<RuntimeManagerView />);
    expect(await screen.findByText('Where should tools be installed?')).toBeTruthy();
    const card = await screen.findByTestId('runtime-tool-whisper');
    fireEvent.click(within(card).getByText('Install'));
    expect(await screen.findByText(/Choose where to install tools first/)).toBeTruthy();
    expect(mockInstallTool).not.toHaveBeenCalled();
  });

  it('shows where tools install to once a location is chosen', async () => {
    render(<RuntimeManagerView />);
    expect((await screen.findByTestId('install-location')).textContent).toContain('Tools install to: D:/Tools/Alphonso-runtimes · 100 GB free');
  });
});
