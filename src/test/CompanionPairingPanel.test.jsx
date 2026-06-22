import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('lucide-react', () => ({
  Key: () => <span data-testid="key-icon">Key</span>,
  Copy: () => <span data-testid="copy-icon">Copy</span>,
  Wifi: () => <span data-testid="wifi-icon">Wifi</span>,
  Shield: () => <span data-testid="shield-icon">Shield</span>,
  QrCode: () => <span data-testid="qr-icon">QR</span>,
  CheckCircle2: () => <span data-testid="check-icon">Check</span>
}));

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ value }) => <span data-testid="qr-code">{value}</span>,
}));

import { invoke } from '@tauri-apps/api/core';
import { CompanionPairingPanel } from '../components/CompanionPairingPanel.jsx';

describe('CompanionPairingPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
  });

  it('shows server not running when status call fails', async () => {
    invoke.mockRejectedValue(new Error('Server not running'));
    render(<CompanionPairingPanel />);
    await waitFor(() => {
      expect(screen.getByText('Companion server not running')).toBeTruthy();
    });
  });

  it('shows server running with Generate PIN button', async () => {
    invoke.mockResolvedValue({ running: true, port: 8765, connected_clients: 0 });
    render(<CompanionPairingPanel />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate PIN/i })).toBeTruthy();
    });
    expect(screen.getByText('Connected clients:')).toBeTruthy();
  });

  it('generates and displays PIN when button clicked', async () => {
    invoke
      .mockResolvedValueOnce({ running: true, port: 8765, connected_clients: 0 })
      .mockResolvedValueOnce('123456');
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    await waitFor(() => {
      expect(screen.getByText('123456')).toBeTruthy();
    });
  });

  it('copies PIN to clipboard when copy button clicked', async () => {
    const mockClipboard = { writeText: vi.fn() };
    Object.assign(navigator, { clipboard: mockClipboard });
    invoke
      .mockResolvedValueOnce({ running: true, port: 8765, connected_clients: 0 })
      .mockResolvedValueOnce('654321');
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    await waitFor(() => screen.getByText('654321'));
    fireEvent.click(screen.getByTitle('Copy PIN'));
    expect(mockClipboard.writeText).toHaveBeenCalledWith('654321');
  });

  it('shows generating state while loading', async () => {
    invoke
      .mockResolvedValueOnce({ running: true, port: 8765, connected_clients: 0 })
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('123456'), 100)));
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    expect(screen.getByRole('button', { name: /Generating.../i })).toBeTruthy();
    await waitFor(() => screen.getByText('123456'));
  });

  it('displays QR code when PIN is generated', async () => {
    invoke
      .mockResolvedValueOnce({ running: true, port: 8765, connected_clients: 0 })
      .mockResolvedValueOnce('123456');
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeTruthy();
      expect(screen.getByTestId('qr-code').textContent).toBe('123456');
    });
  });

  it('displays connected clients count', async () => {
    invoke.mockResolvedValue({ running: true, port: 8765, connected_clients: 2 });
    render(<CompanionPairingPanel />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('starts discovery when Start Discovery button clicked', async () => {
    invoke.mockResolvedValue({ running: true, port: 8765, connected_clients: 0 });
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Start Discovery/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Discovery/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Discovering/i })).toBeTruthy();
    });
    expect(invoke).toHaveBeenCalledWith('companion_start_discovery', { port: 8765 });
  });
});