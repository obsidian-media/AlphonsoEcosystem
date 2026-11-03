// Phone app phase 3 part B (2026-11-02): one way to change settings that the running desktop app
// follows, so a change from the phone isn't put back by the desktop's next save.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { applySettingsPatch, readAppSettings } from '../../services/settingsWriter';
import { SettingsProvider, useSettings } from '../../contexts/SettingsContext';

const saved = () => JSON.parse(localStorage.getItem('alphonso_settings') || '{}');

beforeEach(() => localStorage.clear());

describe('settingsWriter', () => {
  it('a patch is saved, keeping the other settings', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ endpoint: 'http://127.0.0.1:11434', zeroCostMode: true }));
    applySettingsPatch({ zeroCostMode: false });
    expect(saved()).toMatchObject({ endpoint: 'http://127.0.0.1:11434', zeroCostMode: false });
    expect(readAppSettings().zeroCostMode).toBe(false);
  });

  it('nested switches merge instead of replacing the group', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ effectApprovals: { read: true, run: true }, paidModels: { allowed: false, monthlyCapUsd: 5 } }));
    applySettingsPatch({ effectApprovals: { read: false }, paidModels: { monthlyCapUsd: 10 } });
    expect(saved().effectApprovals).toEqual({ read: false, run: true });
    expect(saved().paidModels).toEqual({ allowed: false, monthlyCapUsd: 10 });
  });

  it('the running app follows a patch, and its next save keeps it', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true, showModelThinking: true }));
    let ctx: ReturnType<typeof useSettings> | null = null;
    function Probe() { ctx = useSettings(); return null; }
    render(<SettingsProvider><Probe /></SettingsProvider>);
    act(() => { applySettingsPatch({ zeroCostMode: false }); });
    expect(ctx!.settings.zeroCostMode).toBe(false);
    // The desktop changes something else; the phone's change must survive its save.
    act(() => { ctx!.setSettings((s: Record<string, unknown>) => ({ ...s, showModelThinking: false })); });
    expect(saved()).toMatchObject({ zeroCostMode: false, showModelThinking: false });
  });
});
