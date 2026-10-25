// "Use in a request" (agent phase 1, 2026-10-25): copies Hector's cited report for Chat.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HectorApprovalHandoff } from '../../../components/hector/HectorApprovalHandoff';

describe('HectorApprovalHandoff (Use in a request)', () => {
  it('is disabled without a finished report', () => {
    render(<HectorApprovalHandoff report={null} onCopy={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Use in a request' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('copies the report with its question, then says to paste it into Chat', async () => {
    const onCopy = vi.fn();
    render(<HectorApprovalHandoff report={{ id: 'r1', researchQuestion: 'Bees?', text: 'Answer [1]\n\nSources:\n[1] EU — https://ec.europa.eu' }} onCopy={onCopy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use in a request' }));
    expect(onCopy).toHaveBeenCalledWith('Using Hector\'s report on "Bees?":\n\nAnswer [1]\n\nSources:\n[1] EU — https://ec.europa.eu');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied: paste it into Chat' })).toBeTruthy());
  });
});
