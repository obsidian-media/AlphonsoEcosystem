// Where you see Nova (agent phase 2): Chat's card shows her verdict for the request,
// Settings and /nova list her last verdicts; no keyword score, no extra model call.
import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NovaVerdictCard } from '../../components/nova/NovaVerdictCard';
import { NovaHistoryChart } from '../../components/NovaHistoryChart';
import { saveVerdict, NO_VERDICTS } from '../../services/nova/novaVerdicts';

const verdict = (n, commandId = `cmd-${n}`) => ({
  about: `Bakery question ${n}`, doFirst: 'the email newsletter', requestId: `req-${n}`, commandId, atMs: Date.UTC(2026, 9, 25) + n,
  text: 'What to do first: the email newsletter.\n\n1. Email newsletter: cheap. Value high, effort low, risk low.\n2. Loyalty card: brings regulars back. Value medium, effort low, risk low.\n3. Podcast: slow. Value low, effort high, risk low.\n4. Flyers: old. Value low, effort low, risk low.',
});

beforeEach(() => localStorage.clear());

describe("Chat's Nova card", () => {
  it("Chat shows Nova's verdict for the request", () => {
    saveVerdict(verdict(1, 'cmd-a'));
    render(<NovaVerdictCard commandId="cmd-a" />);
    expect(screen.getByText(/What to do first/)).toBeTruthy();
    expect(screen.getByText(/the email newsletter/)).toBeTruthy();
    expect(screen.queryByText(/Flyers/)).toBeNull();
  });

  it('shows nothing when the request had no Nova verdict', () => {
    const { container } = render(<NovaVerdictCard commandId="cmd-none" />);
    expect(container.textContent).toBe('');
  });

  it('Chat makes no extra Nova call', () => {
    const chat = readFileSync('src/components/ChatView.tsx', 'utf8');
    expect(chat).not.toContain('novaAnalysisService');
    expect(chat).not.toContain('alphonso_nova_threshold');
  });
});

describe('Settings and /nova', () => {
  it('Settings lists the last verdicts', () => {
    saveVerdict(verdict(1));
    saveVerdict(verdict(2));
    render(<NovaHistoryChart />);
    expect(screen.getByText(/Bakery question 2/)).toBeTruthy();
    expect(screen.getByText(/Bakery question 1/)).toBeTruthy();
  });

  it('says how to get one when there is none', () => {
    render(<NovaHistoryChart />);
    expect(screen.getByText(NO_VERDICTS)).toBeTruthy();
  });

  it('Settings has no Nova threshold', () => {
    expect(readFileSync('src/components/SettingsView.tsx', 'utf8')).not.toContain('Insight Score Threshold');
  });
});
