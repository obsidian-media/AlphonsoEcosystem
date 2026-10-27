// Agent phase 5: Project Execution's Marcus panel asks Marcus; the send waits for your approval
// on the board like any other. No tick box, no "packet only", no sending from the panel itself.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../services/marcus/askMarcus', () => ({ askMarcusToSend: vi.fn(async () => ({ ok: true, requestId: 'jose-request-k1' })) }));

import { askMarcusToSend } from '../../services/marcus/askMarcus';
import { MarcusAuditPanel } from '../../components/audit/MarcusAuditPanel';

beforeEach(() => vi.clearAllMocks());

describe('MarcusAuditPanel', () => {
  it('asks Marcus with the text and where it goes; no tick box, no packet-only', async () => {
    render(<MarcusAuditPanel />);
    expect(screen.queryByText(/I explicitly approve/)).toBeNull();
    expect(screen.queryByText(/Queue as packet only/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Slack' }));
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: '#news' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Open Saturday.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask Marcus to send' })); });
    expect(askMarcusToSend).toHaveBeenCalledWith({ text: 'Open Saturday.', connector: 'slack', target: '#news', source: 'Project Execution' });
    expect(screen.getByText('Waiting for your approval on the board.')).toBeTruthy();
  });

  it('Instagram, Facebook and YouTube posts go through Campaign Studio', () => {
    render(<MarcusAuditPanel />);
    expect(screen.queryByRole('button', { name: 'Instagram' })).toBeNull();
    expect(screen.getByText("Posts to Instagram, Facebook and YouTube go through Miya Studio's Campaign Studio.")).toBeTruthy();
  });
});
