// Phone phase 4 test round (throwaway, spike/phone-phase4): the hidden test screen.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Phase4TestScreen, type Phase4TestProps } from '../../mobile/spike/Phase4TestScreen';
import { PHASE4_QUESTIONS } from '../../mobile/spike/phase4Questions';
import type { HttpCall } from '../../mobile/spike/phase4Cloud';

const KEY = 'sk-or-v1-abcdef1234567890abcdef1234567890';

function props(over: Partial<Phase4TestProps> = {}): Phase4TestProps {
  const store = new Map<string, string>();
  const okChat: HttpCall = async () => ({ status: 200, data: { choices: [{ message: { content: '{"route":"direct"}' } }] } });
  return {
    phoneModel: { status: vi.fn(async () => ({ available: true, reason: null })), answer: vi.fn(async () => ({ text: 'Fine.', ms: 50 })) },
    networkKind: vi.fn(async () => 'wifi' as const),
    secrets: { get: vi.fn(async (k: string) => store.get(k) ?? null), set: vi.fn(async (k: string, v: string) => { store.set(k, v); }) },
    http: { fetch: okChat, native: okChat },
    ...over,
  };
}
const results = () => (screen.getByTestId('phase4-results') as HTMLTextAreaElement).value;

describe('Phase4TestScreen', () => {
  it("shows why Apple's model isn't available and still runs the cloud part", async () => {
    const p = props({ phoneModel: { status: vi.fn(async () => ({ available: false, reason: 'appleIntelligenceNotEnabled' })), answer: vi.fn() } });
    render(<Phase4TestScreen {...p} />);
    expect(await screen.findByText(/Apple Intelligence is off/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run on this phone' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('OpenRouter key'), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Run with free cloud models' }));
    await waitFor(() => expect(JSON.parse(results()).cloud).toHaveLength(PHASE4_QUESTIONS.length));
    expect(p.phoneModel.answer).not.toHaveBeenCalled();
  });

  it('a question that fails keeps the run going', async () => {
    const answer = vi.fn(async () => ({ text: 'Fine.', ms: 50 }));
    answer.mockRejectedValueOnce(new Error('exceededContextWindowSize'));
    render(<Phase4TestScreen {...props({ phoneModel: { status: vi.fn(async () => ({ available: true, reason: null })), answer } })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run on this phone' }));
    await waitFor(() => expect(JSON.parse(results()).phone).toHaveLength(PHASE4_QUESTIONS.length));
    const phone = JSON.parse(results()).phone;
    expect(phone[0].error).toMatch(/exceededContextWindowSize/);
    expect(phone[1].text).toBe('Fine.');
    expect(phone[0].network).toBe('wifi');
  });

  it('keys are saved through secrets and never appear in the results box', async () => {
    const p = props();
    render(<Phase4TestScreen {...p} />);
    fireEvent.change(screen.getByLabelText('OpenRouter key'), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Run with free cloud models' }));
    await waitFor(() => expect(JSON.parse(results()).cloud.length).toBeGreaterThan(0));
    expect(p.secrets.set).toHaveBeenCalledWith('spike_openrouter_key', KEY);
    expect(results()).not.toContain('abcdef1234567890abcdef');
  });

  it('Copy results falls back to the text box when the clipboard is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    render(<Phase4TestScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy results' }));
    expect(await screen.findByText(/Select the text below and copy it/)).toBeTruthy();
    expect(screen.getByTestId('phase4-results')).toBeTruthy();
  });
});
