import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DraftPreview } from '../../../features/content-catalyst/workspace/DraftPreview';

describe('DraftPreview', () => {
  it('shows the "No active job" state when activeJob is null', () => {
    render(<DraftPreview activeJob={null} busy={false} onRunStep={vi.fn()} onApprovePublish={vi.fn()} imageRuntime={{}} onStartImageRuntime={vi.fn()} onRefreshImageRuntime={vi.fn()} />);
    expect(screen.getByText('No active job')).toBeTruthy();
  });

  it('renders the Creative output header and status badges when a job is active', () => {
    render(<DraftPreview activeJob={{ id: 'j1', status: 'draft_ready', currentStep: 'draft', draft: {}, request: {} }} busy={false} onRunStep={vi.fn()} onApprovePublish={vi.fn()} imageRuntime={{}} onStartImageRuntime={vi.fn()} onRefreshImageRuntime={vi.fn()} />);
    expect(screen.getByText('Creative output')).toBeTruthy();
    expect(screen.getByText('draft_ready')).toBeTruthy();
  });
});
