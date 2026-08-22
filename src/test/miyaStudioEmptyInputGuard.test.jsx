import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Regression test for a real QA finding (Q&A E2E Test.md N-11): "Miya
// generates a complete content package from entirely empty inputs — hook,
// 4 scenes, shot list, image prompts, 'Topic: Untitled'. A fabricated
// deliverable from nothing, in an app whose whole pitch is not faking
// outputs." Generate Package had no input validation at all — only model
// connectivity gated it.

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
import { generateOllamaResponse } from '../lib/ollama';

function makeProps(overrides = {}) {
  return {
    settings: { selectedModel: 'llama3.2:3b' },
    ollamaStatus: { state: 'connected', label: 'Connected' },
    onStudioStateChange: vi.fn(),
    onPacketCreated: vi.fn(),
    ...overrides
  };
}

describe('MiyaStudio Generate Package empty-input guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('disables Generate Package when every pipeline input field is empty', () => {
    render(<MiyaStudio {...makeProps()} />);
    const button = screen.getByRole('button', { name: /generate package/i });
    expect(button).toBeDisabled();
  });

  it('shows a validation hint instead of the "connect Ollama" message when the model is connected but inputs are empty', () => {
    render(<MiyaStudio {...makeProps()} />);
    expect(screen.getByText(/enter at least one field below first/i)).toBeInTheDocument();
  });

  it('does not call the model at all when Generate Package is clicked with empty inputs', () => {
    render(<MiyaStudio {...makeProps()} />);
    const button = screen.getByRole('button', { name: /generate package/i });
    // Defensive: even a disabled button's onClick should short-circuit if
    // ever reached programmatically (fireEvent bypasses the disabled attr).
    fireEvent.click(button);
    expect(generateOllamaResponse).not.toHaveBeenCalled();
  });

  it('enables Generate Package once any pipeline field has real content', () => {
    render(<MiyaStudio {...makeProps()} />);
    // PipelineInputs renders Idea, Topic, Niche, Goal (in that order) as plain
    // <input>s with an unassociated <label> — no htmlFor/id to query by label.
    const [, topicInput] = screen.getAllByRole('textbox');
    fireEvent.change(topicInput, { target: { value: 'A real topic' } });
    const button = screen.getByRole('button', { name: /generate package/i });
    expect(button).not.toBeDisabled();
  });
});
