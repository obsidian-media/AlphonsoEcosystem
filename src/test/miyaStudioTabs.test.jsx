import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/agentBusService', () => ({
  createAgentPacket: vi.fn(),
  AGENTS: {}
}));
vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn()
}));
vi.mock('../services/miyaMemoryService', () => ({
  pushMiyaMemory: vi.fn(),
  upsertBrandKit: vi.fn()
}));
vi.mock('../services/miyaExportPacketService', () => ({
  buildMiyaExportPacket: vi.fn()
}));
vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn().mockResolvedValue({ response: '{}', done: true })
}));
vi.mock('../services/connectorRegistryService', () => ({
  generateComfyUiImage: vi.fn(),
  getComfyUiVideoHistory: vi.fn().mockResolvedValue([]),
  queueComfyUiVideo: vi.fn()
}));
vi.mock('../services/runwayService', () => ({
  generateRunwayVideo: vi.fn(),
  listPendingRunwayJobs: vi.fn().mockResolvedValue([]),
  resumeRunwayTask: vi.fn()
}));
vi.mock('../services/notificationService', () => ({
  sendNativeNotification: vi.fn()
}));

import { MiyaStudio } from '../components/MiyaStudio';

function makeProps(overrides = {}) {
  return {
    settings: { selectedModel: 'llama3.2:3b' },
    ollamaStatus: { state: 'connected', label: 'Connected' },
    onStudioStateChange: vi.fn(),
    onPacketCreated: vi.fn(),
    ...overrides
  };
}

// AnimatePresence mode="wait" doesn't complete its exit/enter transition on
// its own in jsdom, so assertions right after a tab-switch click must use
// findByText/waitFor, not getByText — see bug-log.md #9 for the same finding
// on HectorResearchDesk.tsx.
describe('MiyaStudio — studio tabs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 7 studio tab labels', () => {
    render(<MiyaStudio {...makeProps()} />);
    for (const label of ['Script Studio', 'Scene Builder', 'Thumbnail Studio', 'Campaign Studio', 'Brands', 'Quick package', 'Prompt Builder']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  // Each content-factory tab has its own tool (owner, 2026-10-22): they used to
  // show one identical view.
  it('gives Script, Scene, Thumbnail and Campaign each their own tool', async () => {
    render(<MiyaStudio {...makeProps({ settings: { selectedModel: 'llama3.2:3b', outputFolder: 'D:\\Content' } })} />);
    fireEvent.change(screen.getByLabelText('New project name'), { target: { value: 'Launch video' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('heading', { name: 'Script Studio' })).toBeTruthy();
    for (const [tab, heading] of [['Scene Builder', 'Scene Builder'], ['Thumbnail Studio', 'Thumbnail Studio'], ['Campaign Studio', 'Campaign Studio']]) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /generate package/i })).toBeNull();
  });

  it('asks for an output folder when none is chosen', () => {
    render(<MiyaStudio {...makeProps()} />);
    expect(screen.getByText(/Choose an output folder in Settings first/)).toBeTruthy();
  });

  it('keeps the old package generator and its brand kit under Quick package', async () => {
    render(<MiyaStudio {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick package' }));
    expect(await screen.findByRole('button', { name: /generate package/i })).toBeTruthy();
    expect(screen.getByText('Save Brand Kit Memory')).toBeTruthy();
  });

  it('opens the Brands editor', async () => {
    render(<MiyaStudio {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brands' }));
    expect(await screen.findByRole('heading', { name: 'Brands' })).toBeTruthy();
  });

  it('switches to the Prompt Builder tab and renders the Local Media Generators panel', async () => {
    render(<MiyaStudio {...makeProps()} />);
    fireEvent.click(screen.getByText('Prompt Builder'));
    expect(await screen.findByText('Local Media Generators')).toBeTruthy();
  });
});
