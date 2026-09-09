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

  it('renders all 6 studio tab labels', () => {
    render(<MiyaStudio {...makeProps()} />);
    expect(screen.getByText('Script Studio')).toBeTruthy();
    expect(screen.getByText('Scene Builder')).toBeTruthy();
    expect(screen.getByText('Prompt Builder')).toBeTruthy();
    expect(screen.getByText('Thumbnail Studio')).toBeTruthy();
    expect(screen.getByText('Campaign Studio')).toBeTruthy();
    expect(screen.getByText('Brand Kit Memory')).toBeTruthy();
  });

  it('switches to the Brand Kit Memory tab and renders the Save Brand Kit button', async () => {
    render(<MiyaStudio {...makeProps()} />);
    fireEvent.click(screen.getByText('Brand Kit Memory'));
    expect(await screen.findByText('Save Brand Kit Memory')).toBeTruthy();
  });

  it('switches to the Prompt Builder tab and renders the Local Media Generators panel', async () => {
    render(<MiyaStudio {...makeProps()} />);
    fireEvent.click(screen.getByText('Prompt Builder'));
    expect(await screen.findByText('Local Media Generators')).toBeTruthy();
  });
});
