import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Settings → Bridges (owner, 2026-10-22). QA Bug 64: the old ACC box under
// Backup never turned the bridge on, so it never sent anything.

let stored: Record<string, unknown> = { enabled: false, baseUrl: '', token: '', pathPrefix: '/api/alphonso-bridge', timeoutMs: 15000 };
const mockUpdate = vi.fn((patch: Record<string, unknown>) => { stored = { ...stored, ...patch }; return stored; });
const mockCheck = vi.fn();
const mockLocal = vi.fn();
const mockChoose = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();
vi.mock('../../services/agentWorkshop/accBridgeService', () => ({
  getAccBridgeConfig: () => stored,
  updateAccBridgeConfig: (p: Record<string, unknown>) => mockUpdate(p),
  checkAccBridge: () => mockCheck(),
  getAccLocalState: () => mockLocal(),
  chooseAccFolder: () => mockChoose(),
  startAcc: () => mockStart(),
  stopAcc: () => mockStop(),
}));

import { BridgesPanel } from '../../components/BridgesPanel';

describe('BridgesPanel', () => {
  beforeEach(() => {
    stored = { enabled: false, baseUrl: '', token: '', pathPrefix: '/api/alphonso-bridge', timeoutMs: 15000 };
    mockUpdate.mockClear();
    mockCheck.mockReset();
    mockLocal.mockReset().mockResolvedValue({ folder: null });
    mockChoose.mockReset();
    mockStart.mockReset();
    mockStop.mockReset().mockResolvedValue({ ok: true, stopped: true });
  });

  it('turns the ACC bridge on and saves the address and token', () => {
    render(<BridgesPanel />);
    fireEvent.change(screen.getByLabelText('ACC address'), { target: { value: 'http://localhost:4000' } });
    fireEvent.change(screen.getByLabelText('Bridge token'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Use the ACC bridge' }));
    expect(stored).toMatchObject({ enabled: true, baseUrl: 'http://localhost:4000', token: 'secret' });
  });

  it('Test reports what ACC answered', async () => {
    mockCheck.mockResolvedValue({ ok: false, status: 'unauthorized', httpStatus: 401 });
    render(<BridgesPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText(/ACC answered but refused the token/)).toBeTruthy();
    mockCheck.mockResolvedValue({ ok: true, status: 'connected' });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText(/Connected: ACC answered and accepted the token\. Turn the bridge on to use it\./)).toBeTruthy();
  });

  it('says plainly that SessionGuard sign-in is not available yet', () => {
    render(<BridgesPanel />);
    expect(screen.getByTestId('bridge-sessionguard').textContent).toMatch(/not available yet/);
  });

  // Owner, 2026-10-22: a Start button for an ACC on this computer.
  describe('ACC on this computer', () => {
    it('offers Start only once a folder is chosen, the address is local and ACC is not answering', async () => {
      stored = { ...stored, baseUrl: 'http://localhost:4000' };
      render(<BridgesPanel />);
      expect(await screen.findByRole('button', { name: "Choose ACC's folder…" })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();

      mockChoose.mockResolvedValue({ ok: true, state: { folder: 'D:/repos/ACC', startedByAlphonso: false } });
      fireEvent.click(screen.getByRole('button', { name: "Choose ACC's folder…" }));
      expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
    });

    it('says why a chosen folder was refused', async () => {
      mockChoose.mockResolvedValue({ ok: false, error: "That folder isn't ACC.", state: { folder: null } });
      render(<BridgesPanel />);
      fireEvent.click(await screen.findByRole('button', { name: "Choose ACC's folder…" }));
      expect(await screen.findByText("That folder isn't ACC.")).toBeTruthy();
    });

    it('starts ACC, shows it answering, and offers Stop', async () => {
      stored = { ...stored, baseUrl: 'http://127.0.0.1:4000' };
      mockLocal.mockResolvedValueOnce({ folder: 'D:/repos/ACC', startedByAlphonso: false })
        .mockResolvedValue({ folder: 'D:/repos/ACC', startedByAlphonso: true });
      mockStart.mockResolvedValue({ ok: true, status: 'connected', started: true });
      render(<BridgesPanel />);
      fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
      expect(await screen.findByText('ACC started.')).toBeTruthy();
      expect(screen.getByText(/Connected: ACC answered/)).toBeTruthy();
      fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
      expect(await screen.findByText('ACC stopped.')).toBeTruthy();
      expect(mockStop).toHaveBeenCalled();
    });

    it('hides Start for an ACC that is not on this computer', async () => {
      stored = { ...stored, baseUrl: 'https://acc.example.com' };
      mockLocal.mockResolvedValue({ folder: 'D:/repos/ACC', startedByAlphonso: false });
      render(<BridgesPanel />);
      expect(await screen.findByText(/the address above points elsewhere/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });
  });
});
