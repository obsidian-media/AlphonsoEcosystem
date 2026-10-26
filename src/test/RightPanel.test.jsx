import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/sentinelSecurityService', () => ({
  recentActivityText: vi.fn(() => ({ text: '- jose executed', items: 3 }))
}));
// Agent phase 4: the card shows Sentinel's last review of the week; Re-scan asks for a new one.
vi.mock('../services/sentinel/sentinelWeekly', () => ({
  lastSentinelReview: vi.fn(() => null),
  askSentinelWeekReview: vi.fn(async () => ({ state: 'done', summary: 'Safe.' }))
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
import { recentActivityText } from '../services/sentinelSecurityService';
import { lastSentinelReview, askSentinelWeekReview } from '../services/sentinel/sentinelWeekly';

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
    recentActivityText.mockReturnValue({ text: '- jose executed', items: 3 });
    lastSentinelReview.mockReturnValue(null);
    askSentinelWeekReview.mockClear();
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

  // Agent phase 4: the card is Sentinel's last review of the week, from its request.
  it('no review starts on its own', () => {
    render(<RightPanel {...defaultProps} />);
    expect(askSentinelWeekReview).not.toHaveBeenCalled();
    expect(screen.getByText(/No review yet/)).toBeTruthy();
  });

  it('a risky review shows amber, unsafe red, safe green', () => {
    for (const [verdict, color] of [['risky', 'warning'], ['unsafe', 'error'], ['safe', 'success']]) {
      lastSentinelReview.mockReturnValue({ requestId: 'r', verdict, findings: verdict === 'safe' ? [] : ['http://x: a fake login → remove it'], summary: '', atMs: Date.now() });
      const { unmount } = render(<RightPanel {...defaultProps} />);
      const card = screen.getByTestId('sentinel-review-card');
      expect(card.getAttribute('data-verdict')).toBe(verdict);
      expect(card.className).toContain(`--${color}-dim`);
      unmount();
    }
  });

  it('shows his findings', () => {
    lastSentinelReview.mockReturnValue({ requestId: 'r', verdict: 'unsafe', findings: ['http://paypa1.com: a fake login → remove it'], summary: '', atMs: Date.now() });
    render(<RightPanel {...defaultProps} />);
    expect(screen.getByText(/a fake login/)).toBeTruthy();
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

  it("Re-scan asks Sentinel to review the week's activity", async () => {
    render(<RightPanel {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Re-scan'));
    await waitFor(() => expect(askSentinelWeekReview).toHaveBeenCalledWith('- jose executed', { source: 'user' }));
  });

  it('with no activity, Re-scan says there is nothing to review', () => {
    recentActivityText.mockReturnValue({ text: '', items: 0 });
    render(<RightPanel {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Re-scan'));
    expect(askSentinelWeekReview).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing to review yet/)).toBeTruthy();
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
