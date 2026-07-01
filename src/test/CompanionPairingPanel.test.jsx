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
  QRCodeCanvas: ({ value }) => <canvas data-testid="qr-code" data-value={value} />,
}));

import { invoke } from '@tauri-apps/api/core';
import { CompanionPairingPanel } from '../components/CompanionPairingPanel.tsx';

function mockInvokeByCommand(overrides = {}) {
  const defaults = {
    companion_get_status: { running: true, port: 8765, connected_clients: 0 },
    companion_get_local_ip: ['192.168.1.1'],
    companion_get_pin: '123456',
    companion_start_discovery: undefined,
  };
  const map = { ...defaults, ...overrides };
  invoke.mockImplementation((cmd) => {
    if (cmd in map) return Promise.resolve(map[cmd]);
    return Promise.resolve(null);
  });
}

describe('CompanionPairingPanel', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows server not running when status call fails', async () => {
    invoke.mockRejectedValue(new Error('Server not running'));
    render(<CompanionPairingPanel />);
    await waitFor(() => {
      expect(screen.getByText('Companion server not running')).toBeTruthy();
    });
  });

  it('shows server running with Generate PIN button', async () => {
    mockInvokeByCommand();
    render(<CompanionPairingPanel />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate PIN/i })).toBeTruthy();
    });
    expect(screen.getByText('Connected clients:')).toBeTruthy();
  });

  it('generates and displays PIN when button clicked', async () => {
    mockInvokeByCommand({ companion_get_pin: '123456' });
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
    mockInvokeByCommand({ companion_get_pin: '654321' });
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    await waitFor(() => screen.getByText('654321'));
    fireEvent.click(screen.getByTitle('Copy PIN'));
    expect(mockClipboard.writeText).toHaveBeenCalledWith('654321');
  });

  it('shows generating state while loading', async () => {
    const { companion_get_local_ip, ...rest } = {
      companion_get_status: { running: true, port: 8765, connected_clients: 0 },
      companion_get_local_ip: ['192.168.1.1'],
    };
    invoke.mockImplementation((cmd) => {
      if (cmd === 'companion_get_local_ip') return Promise.resolve(['192.168.1.1']);
      if (cmd === 'companion_get_status') return Promise.resolve({ running: true, port: 8765, connected_clients: 0 });
      if (cmd === 'companion_get_pin') return new Promise((resolve) => setTimeout(() => resolve('123456'), 100));
      return Promise.resolve(null);
    });
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    expect(screen.getByRole('button', { name: /Generating.../i })).toBeTruthy();
    await waitFor(() => screen.getByText('123456'));
  });

  it('displays QR code when PIN is generated', async () => {
    mockInvokeByCommand({ companion_get_pin: '123456' });
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Generate PIN/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate PIN/i }));
    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeTruthy();
      expect(screen.getByTestId('qr-code').getAttribute('data-value')).toBe('123456');
    });
  });

  it('displays connected clients count', async () => {
    mockInvokeByCommand({ companion_get_status: { running: true, port: 8765, connected_clients: 2 } });
    render(<CompanionPairingPanel />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('starts discovery when Start Discovery button clicked', async () => {
    mockInvokeByCommand();
    render(<CompanionPairingPanel />);
    await waitFor(() => screen.getByRole('button', { name: /Start Discovery/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Discovery/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Discovering/i })).toBeTruthy();
    });
    expect(invoke).toHaveBeenCalledWith('companion_start_discovery', { port: 8765 });
  });
});