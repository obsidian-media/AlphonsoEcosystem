import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OllamaProvider, useOllama } from '../contexts/OllamaContext';
import { SettingsProvider } from '../contexts/SettingsContext';

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn()
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => 'C:/default')
}));

vi.mock('../hooks/useOllamaHealth', () => ({
  useOllamaHealth: vi.fn(() => vi.fn())
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { TEMPORARY: 'temporary', VERIFIED: 'verified', UNVERIFIED: 'unverified' }
}));

vi.mock('../lib/ollama', () => ({
  OLLAMA_TROUBLESHOOTING_COMMAND: 'ollama list'
}));

vi.mock('../constants/appConstants', () => ({
  COPY_RESET_MS: 2000
}));

function TestConsumer() {
  const { ollamaStatus, installedModels, selectedModelMissing } = useOllama();
  return (
    <div>
      <span data-testid="state">{ollamaStatus.state}</span>
      <span data-testid="models">{installedModels.length}</span>
      <span data-testid="missing">{String(selectedModelMissing)}</span>
    </div>
  );
}

function renderWithProviders(ui) {
  return render(
    <SettingsProvider>
      <OllamaProvider>{ui}</OllamaProvider>
    </SettingsProvider>
  );
}

describe('OllamaContext', () => {
  it('provides initial ollama status', () => {
    renderWithProviders(<TestConsumer />);
    expect(screen.getByTestId('state').textContent).toBe('connecting');
  });

  it('provides empty models list initially', () => {
    renderWithProviders(<TestConsumer />);
    expect(screen.getByTestId('models').textContent).toBe('0');
  });

  it('throws when useOllama used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useOllama();
      return null;
    }
    expect(() => render(<SettingsProvider><Bad /></SettingsProvider>)).toThrow('useOllama must be used within OllamaProvider');
    spy.mockRestore();
  });
});
