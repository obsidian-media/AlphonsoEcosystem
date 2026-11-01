import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from '../contexts/SettingsContext';
import { setStorage } from '../lib/appStorage';

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

  // 2.11.0 QA (owner, 2026-11-01): the model chosen in Chat or Settings kept going back to an
  // older one. The Coach window wrote the settings it read when it opened over the main window's.
  describe('the Coach window', () => {
    afterEach(() => window.history.replaceState(null, '', '/'));

    it('never saves settings, and follows a change the main window saved', () => {
      window.history.replaceState(null, '', '/?coach=1');
      vi.mocked(setStorage).mockClear();
      render(<SettingsProvider><TestConsumer /></SettingsProvider>);
      act(() => { screen.getByText('change').click(); });
      expect(vi.mocked(setStorage).mock.calls.filter(([k]) => k === 'alphonso_settings')).toEqual([]);
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'alphonso_settings', newValue: JSON.stringify({ endpoint: 'http://from-main' }) }));
      });
      expect(screen.getByTestId('endpoint').textContent).toBe('http://from-main');
    });

    it('the main window also follows a change saved by another window', () => {
      render(<SettingsProvider><TestConsumer /></SettingsProvider>);
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'alphonso_settings', newValue: JSON.stringify({ endpoint: 'http://other-window' }) }));
      });
      expect(screen.getByTestId('endpoint').textContent).toBe('http://other-window');
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'alphonso_settings', newValue: 'not json' }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'something_else', newValue: '{}' }));
      });
      expect(screen.getByTestId('endpoint').textContent).toBe('http://other-window');
    });
  });
});
