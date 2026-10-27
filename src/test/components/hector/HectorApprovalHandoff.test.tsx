// "Use in a request" (agent phase 1, 2026-10-25): hands Hector's cited report to Chat.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HectorApprovalHandoff } from '../../../components/hector/HectorApprovalHandoff';

describe('HectorApprovalHandoff (Use in a request)', () => {
  it('is disabled without a finished report', () => {
    render(<HectorApprovalHandoff report={null} onUse={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Use in a request' }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Agent roles Part C2: it fills Chat's message box instead of the clipboard.
  it('hands the report with its question to Chat, then says what to do there', async () => {
    const onUse = vi.fn();
    render(<HectorApprovalHandoff report={{ id: 'r1', researchQuestion: 'Bees?', text: 'Answer [1]\n\nSources:\n[1] EU — https://ec.europa.eu' }} onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use in a request' }));
    expect(onUse).toHaveBeenCalledWith('Using Hector\'s report on "Bees?":\n\nAnswer [1]\n\nSources:\n[1] EU — https://ec.europa.eu');
    await waitFor(() => expect(screen.getByText('In Chat: add what you want done, then send.')).toBeTruthy());
  });
});
