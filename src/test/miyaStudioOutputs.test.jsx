import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// QA 2026-10-22, Miya Studio in the real app: the package showed raw JSON,
// the brand kit was never used or loaded back, saving it gave no sign, and
// Miya used Chat's model instead of her own.

const mockSavedMemory = [];
vi.mock('../services/agentBusService', () => ({ createAgentPacket: vi.fn(() => ({ id: 'p1' })), AGENTS: { MIYA: 'miya', JOSE: 'jose' } }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/miyaMemoryService', () => ({
  pushMiyaMemory: vi.fn(),
  upsertBrandKit: vi.fn((kit) => ({ id: 'miya-brand-kit', content: kit })),
  listMiyaMemory: vi.fn(() => mockSavedMemory),
}));
vi.mock('../services/miyaExportPacketService', () => ({ buildMiyaExportPacket: vi.fn() }));
vi.mock('../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));
vi.mock('../services/connectorRegistryService', () => ({ generateComfyUiImage: vi.fn(), getComfyUiVideoHistory: vi.fn().mockResolvedValue([]), queueComfyUiVideo: vi.fn() }));
vi.mock('../services/runwayService', () => ({ generateRunwayVideo: vi.fn(), listPendingRunwayJobs: vi.fn().mockResolvedValue([]), resumeRunwayTask: vi.fn() }));
vi.mock('../services/notificationService', () => ({ sendNativeNotification: vi.fn() }));

import { MiyaStudio } from '../components/MiyaStudio';
import { generateAgentLlmResponse } from '../lib/ollama';
import { toReadableText } from '../lib/readableValue';

const props = () => ({
  settings: { selectedModel: 'llama3.2:3b', endpoint: 'http://127.0.0.1:11434' },
  ollamaStatus: { state: 'connected', label: 'Connected' },
  onStudioStateChange: vi.fn(),
  onPacketCreated: vi.fn(),
});

describe('Miya Studio package and brand kit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSavedMemory.length = 0;
  });

  it("uses Miya's own model and shows the package as readable text, not JSON", async () => {
    generateAgentLlmResponse.mockResolvedValue({
      response: JSON.stringify({
        hook: { text: 'Small changes at home make a big difference!' },
        scenes: [{ scene_id: 1, description: 'Turning off the lights' }, { scene_id: 2, description: 'Using a power strip' }],
      }),
    });
    render(<MiyaStudio {...props()} />);
    // Generate Package lives in "Quick package" since the content factory (2026-10-22).
    fireEvent.click(screen.getByRole('button', { name: 'Quick package' }));
    await screen.findByRole('button', { name: /generate package/i });
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: 'Saving energy at home' } });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));
    await waitFor(() => expect(screen.getByTestId('miya-output-hook').textContent).toContain('Small changes at home make a big difference!'));
    expect(generateAgentLlmResponse).toHaveBeenCalledWith('miya', expect.objectContaining({ format: 'json' }));
    const hook = screen.getByTestId('miya-output-hook').textContent;
    expect(hook).not.toContain('{');
    const scenes = screen.getByTestId('miya-output-scenes').textContent;
    expect(scenes).toContain('• Turning off the lights');
    expect(scenes).not.toContain('scene_id');
  });

  it('puts the saved brand kit into the prompt and loads it back on the next visit', async () => {
    mockSavedMemory.push({ id: 'miya-brand-kit', content: { tone: 'Warm and plain-spoken', colors: 'Forest green' } });
    generateAgentLlmResponse.mockResolvedValue({ response: '{"hook":"Hi"}' });
    render(<MiyaStudio {...props()} />);
    // Generate Package lives in "Quick package" since the content factory (2026-10-22).
    fireEvent.click(screen.getByRole('button', { name: 'Quick package' }));
    await screen.findByRole('button', { name: /generate package/i });
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: 'Saving energy' } });
    fireEvent.click(screen.getByRole('button', { name: /generate package/i }));
    await waitFor(() => expect(generateAgentLlmResponse).toHaveBeenCalled());
    const { prompt } = generateAgentLlmResponse.mock.calls[0][1];
    expect(prompt).toContain('Follow this brand kit:');
    expect(prompt).toContain('Warm and plain-spoken');
    expect(prompt).toContain('Forest green');

    // The Quick package brand kit is on the same tab.
    expect((await screen.findByLabelText('Tone')).value).toBe('Warm and plain-spoken');
  });

  it('says the brand kit was saved', async () => {
    render(<MiyaStudio {...props()} />);
    // Generate Package lives in "Quick package" since the content factory (2026-10-22).
    fireEvent.click(screen.getByRole('button', { name: 'Quick package' }));
    await screen.findByRole('button', { name: /generate package/i });
    fireEvent.click(await screen.findByRole('button', { name: /save brand kit memory/i }));
    expect(screen.getByRole('status').textContent).toMatch(/^Saved /);
  });
});

describe('toReadableText', () => {
  it('turns nested model output into readable text', () => {
    expect(toReadableText({ text: 'Hello' })).toBe('Hello');
    expect(toReadableText([{ scene_id: 1, description: 'A' }, { scene_id: 2, description: 'B' }])).toBe('• A\n• B');
    expect(toReadableText({ title: 'Video', tags: ['energy', 'home'] })).toBe('Video\nTags:\n  • energy\n  • home');
    expect(toReadableText({ duration: 30, platform: 'YouTube' })).toBe('Duration: 30\nPlatform: YouTube');
    expect(toReadableText('plain')).toBe('plain');
  });
});
