// 2.11.0 QA (owner, 2026-11-01): the top right showed "qwen2.5:7b" while Chat used OpenRouter.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../agents/agentRegistry', () => ({
  listAgentProfiles: () => [{ id: 'alphonso', name: 'Alphonso' }, { id: 'hector', name: 'Hector' }, { id: 'maria', name: 'Maria' }],
}));
vi.mock('../../services/modelSelectionService', () => ({
  getAgentProvider: (id: string) => (id === 'hector' ? { provider: 'paid' } : id === 'maria' ? { provider: 'nvidia_nim', model: 'meta/llama-4' } : { provider: 'ollama' }),
}));

import { ActiveModelBadge } from '../../components/ActiveModelBadge';

describe('ActiveModelBadge', () => {
  it("shows the provider and model Chat uses, cloud included", () => {
    render(<ActiveModelBadge settings={{ selectedProvider: 'openrouter', selectedModel: 'anthropic/claude-sonnet' }} ollamaState="connected" />);
    expect(screen.getByTestId('active-model').textContent).toBe('OpenRouter · anthropic/claude-sonnet');
  });

  it('says when the chosen Ollama model is missing', () => {
    render(<ActiveModelBadge settings={{ selectedProvider: 'ollama', selectedModel: 'qwen3:0.6b' }} ollamaState="model_missing" selectedModelMissing />);
    expect(screen.getByTestId('active-model').textContent).toBe('Ollama · No model');
  });

  it("lists each agent's provider and model when clicked", () => {
    render(<ActiveModelBadge settings={{ selectedModel: 'qwen3:0.6b' }} ollamaState="connected" />);
    expect(screen.getByTestId('active-model').textContent).toBe('Ollama · qwen3:0.6b');
    fireEvent.click(screen.getByRole('button', { name: /models in use/i }));
    const rows = screen.getAllByTestId(/^agent-model-/).map((r) => r.textContent);
    expect(rows).toEqual([
      'AlphonsoOllama · qwen3:0.6b',
      'HectorPaid model (asks first)',
      'MariaNVIDIA NIM · meta/llama-4',
    ]);
  });
});
