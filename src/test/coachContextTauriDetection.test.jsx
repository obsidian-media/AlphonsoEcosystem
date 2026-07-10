import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useCoach, CoachProvider } from '../contexts/CoachContext';

vi.mock('../services/coachModeService', () => ({
  openCoachWindow: vi.fn().mockRejectedValue(new Error('missing window capability grant')),
  closeCoachWindow: vi.fn().mockResolvedValue()
}));

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { coachAgent: 'alphonso' } })
}));

function Consumer() {
  const ctx = useCoach();
  return <button onClick={ctx.handleToggleCoachMode}>Toggle</button>;
}

describe('CoachContext Tauri runtime detection', () => {
  let toastMessages;

  beforeEach(() => {
    toastMessages = [];
    window.addEventListener('alphonso:toast', (e) => toastMessages.push(e.detail));
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it('surfaces a real error (not a "requires Tauri runtime" no-op message) when running inside the real Tauri desktop runtime', async () => {
    window.__TAURI_INTERNALS__ = {};

    render(
      <CoachProvider>
        <Consumer />
      </CoachProvider>
    );

    fireEvent.click(screen.getByText('Toggle'));

    await waitFor(() => expect(toastMessages.length).toBeGreaterThan(0));
    expect(toastMessages[0].type).toBe('error');
    expect(toastMessages[0].message).toContain('Coach mode failed to open');
    expect(toastMessages[0].message).not.toContain('requires Tauri runtime');
  });
});
