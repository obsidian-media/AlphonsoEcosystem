import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from '../contexts/SettingsContext';

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn()
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => 'C:/default')
}));

function TestConsumer() {
  const { settings, setSettings, operatorMode, setOperatorMode } = useSettings();
  return (
    <div>
      <span data-testid="endpoint">{settings.endpoint}</span>
      <span data-testid="operator">{String(operatorMode)}</span>
      <button onClick={() => setSettings((s) => ({ ...s, endpoint: 'http://changed' }))}>change</button>
      <button onClick={() => setOperatorMode(true)}>enable operator</button>
    </div>
  );
}

describe('SettingsContext', () => {
  it('provides default settings', () => {
    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );
    expect(screen.getByTestId('endpoint').textContent).toBe('http://localhost:11434');
    expect(screen.getByTestId('operator').textContent).toBe('false');
  });

  it('allows updating settings via function', () => {
    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );
    act(() => {
      screen.getByText('change').click();
    });
    expect(screen.getByTestId('endpoint').textContent).toBe('http://changed');
  });

  it('allows toggling operator mode', () => {
    render(
      <SettingsProvider>
        <TestConsumer />
      </SettingsProvider>
    );
    act(() => {
      screen.getByText('enable operator').click();
    });
    expect(screen.getByTestId('operator').textContent).toBe('true');
  });

  it('throws when useSettings used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useSettings();
      return null;
    }
    expect(() => render(<Bad />)).toThrow('useSettings must be used within SettingsProvider');
    spy.mockRestore();
  });
});
