import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/sentinelSecurityService', () => ({
  scanForThreats: vi.fn(() => ({
    riskLevel: 'low',
    findings: [],
    score: 10
  }))
}));

vi.mock('../lib/ollama', () => ({
  formatModelSize: vi.fn((n) => `${n}B`),
  generateOllamaResponse: vi.fn(),
  generateOllamaChatStream: vi.fn(),
  PREFERRED_MODEL: 'llama3.2:3b'
}));

// Mock missionRoomService used transitively by sentinelSecurityService
vi.mock('../services/missionRoomService', () => ({
  classifyMissionRoomRisk: vi.fn(() => ({ level: 'none', secrets: [] })),
  redactMissionRoomSecrets: vi.fn((text) => text)
}));

import { RightPanel } from '../components/RightPanel.jsx';
import { scanForThreats } from '../services/sentinelSecurityService';

const defaultProps = {
  settings: { selectedModel: 'llama3.2:3b' },
  ollamaStatus: { state: 'connected', label: 'Connected' },
  installedModels: [{ name: 'llama3.2:3b', size: 3 }],
  desktopBridge: { state: 'disconnected', label: 'Not available' },
  selectedModelMissing: false,
  onCheckOllama: vi.fn(),
  operatorMode: false,
  updateCheckState: { status: 'idle' }
};

describe('RightPanel', () => {
  beforeEach(() => {
    // Clear localStorage before each test so mount effect always runs
    localStorage.clear();
    scanForThreats.mockClear();
    scanForThreats.mockReturnValue({ riskLevel: 'low', findings: [], score: 10 });
    defaultProps.onCheckOllama.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders without crashing (smoke test)', () => {
    render(<RightPanel {...defaultProps} />);
    // Panel renders at minimum a System header or collapse button
    expect(document.body.firstChild).toBeTruthy();
  });

  it('runs sentinel scan on mount when no stored scan', () => {
    render(<RightPanel {...defaultProps} />);
    expect(scanForThreats).toHaveBeenCalledWith('', {});
  });

  it('does not run sentinel scan on mount when stored scan exists', () => {
    const storedScan = JSON.stringify({ riskLevel: 'low', findings: [], score: 10, scannedAt: Date.now() });
    localStorage.setItem('alphonso_sentinel_last_scan_v1', storedScan);
    render(<RightPanel {...defaultProps} />);
    expect(scanForThreats).not.toHaveBeenCalled();
  });

  it('shows Security section header', () => {
    render(<RightPanel {...defaultProps} />);
    expect(screen.getByText('Security')).toBeTruthy();
  });

  it('shows re-scan button (↺)', () => {
    render(<RightPanel {...defaultProps} />);
    const reScanBtn = screen.getByTitle('Re-scan');
    expect(reScanBtn).toBeTruthy();
    expect(reScanBtn.getAttribute('aria-label')).toBe('Re-scan for security threats');
  });

  it('clicking re-scan button calls scanForThreats again', () => {
    render(<RightPanel {...defaultProps} />);
    // Initial mount call
    const initialCallCount = scanForThreats.mock.calls.length;
    const reScanBtn = screen.getByTitle('Re-scan');
    fireEvent.click(reScanBtn);
    expect(scanForThreats.mock.calls.length).toBe(initialCallCount + 1);
  });

  it('shows threat level from scan result', () => {
    scanForThreats.mockReturnValue({ riskLevel: 'low', findings: [], score: 10 });
    render(<RightPanel {...defaultProps} />);
    expect(screen.getByText('Threat Level')).toBeTruthy();
    expect(screen.getByText('low')).toBeTruthy();
  });

  it('collapsed state toggle button exists and collapses the panel', () => {
    render(<RightPanel {...defaultProps} />);
    // In expanded state, find the collapse button (ChevronRight)
    const collapseBtn = screen.getByTitle('Collapse diagnostics');
    expect(collapseBtn).toBeTruthy();
    fireEvent.click(collapseBtn);
    // After collapsing, diagnostics section should be hidden (System header gone)
    expect(screen.queryByText('Security')).toBeNull();
    // Expand button should appear
    expect(screen.getByTitle('Expand diagnostics')).toBeTruthy();
  });
});
