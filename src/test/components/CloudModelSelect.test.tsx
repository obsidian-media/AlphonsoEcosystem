import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Owner, 2026-10-22: the user chooses the Claude/ChatGPT model from the
// provider's live list; the defaults are only preselected.

const saved: Record<string, string> = {};
const mockSave = vi.fn((_id: string, key: string, value: string) => { saved[key] = value; });
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (_id: string, key: string) => saved[key] || '',
  saveConnectorCredential: (...a: [string, string, string]) => mockSave(...a),
}));
const mockListClaude = vi.fn();
vi.mock('../../services/claudeService', () => ({
  CLAUDE_DEFAULT_MODEL: 'claude-haiku-5-5',
  listClaudeModels: () => mockListClaude(),
}));
vi.mock('../../services/chatgptService', () => ({
  OPENAI_DEFAULT_MODEL: 'gpt-6-luna',
  listOpenAiModels: vi.fn(async () => ({ ok: true, models: [] })),
}));

import { CloudModelSelect } from '../../components/CloudModelSelect';

describe('CloudModelSelect', () => {
  beforeEach(() => {
    for (const k of Object.keys(saved)) delete saved[k];
    mockSave.mockClear();
    mockListClaude.mockReset();
  });

  it("lists the provider's models with the default preselected, and saves a choice", async () => {
    mockListClaude.mockResolvedValue({ ok: true, models: ['claude-haiku-5-5', 'claude-sonnet-5-5'] });
    render(<CloudModelSelect provider="claude" />);
    const select = await screen.findByLabelText('Model');
    expect((select as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('option', { name: 'Default (claude-haiku-5-5)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'claude-sonnet-5-5' } });
    expect(mockSave).toHaveBeenCalledWith('claude', 'CLAUDE_MODEL', 'claude-sonnet-5-5');
  });

  it('keeps a chosen model that is not in the list, so it is not silently lost', async () => {
    saved.CLAUDE_MODEL = 'claude-opus-5-5';
    mockListClaude.mockResolvedValue({ ok: true, models: ['claude-haiku-5-5'] });
    render(<CloudModelSelect provider="claude" />);
    const select = await screen.findByLabelText('Model');
    expect((select as HTMLSelectElement).value).toBe('claude-opus-5-5');
  });

  it("lets the user type a model name when the list can't be loaded", async () => {
    mockListClaude.mockResolvedValue({ ok: false, models: [], error: 'Anthropic answered HTTP 401.' });
    render(<CloudModelSelect provider="claude" />);
    expect(await screen.findByText(/Anthropic answered HTTP 401\. You can type a model name instead\./)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('claude-haiku-5-5 (default)'), { target: { value: 'claude-sonnet-5-5' } });
    expect(mockSave).toHaveBeenCalledWith('claude', 'CLAUDE_MODEL', 'claude-sonnet-5-5');
  });
});
