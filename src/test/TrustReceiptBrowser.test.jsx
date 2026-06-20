import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TrustReceiptBrowser } from '../components/TrustReceiptBrowser';

vi.mock('../services/verificationService', () => ({
  readDurableAuditLog: vi.fn(async () => ([
    {
      timestamp_ms: 1716100000000,
      event_type: 'approval_required',
      chain_hash: 'hash-one',
      entry: {
        agent: 'jose',
        status: 'blocked',
        action: 'external_send',
        proof_hash: 'hash-one'
      }
    },
    {
      timestamp_ms: 1716101000000,
      event_type: 'connector_request',
      chain_hash: 'hash-two',
      entry: {
        agent: 'hector',
        status: 'allowed',
        action: 'research',
        proof_hash: 'hash-two'
      }
    }
  ]))
}));

describe('TrustReceiptBrowser', () => {
  it('loads receipts and filters them by agent and status', async () => {
    render(<TrustReceiptBrowser />);

    await waitFor(() => expect(screen.getByText('hash-one')).toBeInTheDocument());
    expect(screen.getByText('hash-two')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'jose' } });
    expect(screen.getByText('hash-one')).toBeInTheDocument();
    expect(screen.queryByText('hash-two')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'blocked' } });
    expect(screen.getByText('hash-one')).toBeInTheDocument();
  });
});
