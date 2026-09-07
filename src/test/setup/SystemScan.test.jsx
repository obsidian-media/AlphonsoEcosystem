import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/setupFlowService', () => ({
  scanHardware: vi.fn(),
}));
vi.mock('../../services/runtimeManagerService', () => ({
  checkPrerequisites: vi.fn(),
}));

import { scanHardware } from '../../services/setupFlowService';
import { checkPrerequisites } from '../../services/runtimeManagerService';
import { SystemScan } from '../../components/setup/SystemScan';

beforeEach(() => vi.clearAllMocks());

describe('SystemScan', () => {
  it('shows a scanning state, then results once both scans resolve', async () => {
    scanHardware.mockResolvedValue({ ramGb: 16, diskFreeGb: 220, gpuPresent: true, gpuVendor: 'NVIDIA', gpuModel: 'RTX 4060' });
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'All prerequisites found.', dockerFound: false });

    render(<SystemScan onContinue={() => {}} />);
    expect(screen.getByText(/scanning/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/16 ?GB RAM/i)).toBeInTheDocument());
    expect(screen.getByText(/220 ?GB free/i)).toBeInTheDocument();
    expect(screen.getByText(/RTX 4060/i)).toBeInTheDocument();
  });

  it('shows "no GPU detected" when gpuPresent is false', async () => {
    scanHardware.mockResolvedValue({ ramGb: 8, diskFreeGb: 50, gpuPresent: false, gpuVendor: null, gpuModel: null });
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'All prerequisites found.', dockerFound: false });

    render(<SystemScan onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no gpu detected/i)).toBeInTheDocument());
  });

  it('calls onContinue when the Continue button is clicked after scan completes', async () => {
    scanHardware.mockResolvedValue({ ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null });
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'All prerequisites found.', dockerFound: false });
    const onContinue = vi.fn();

    render(<SystemScan onContinue={onContinue} />);
    const button = await waitFor(() => screen.getByText('Continue'));
    button.click();
    expect(onContinue).toHaveBeenCalled();
  });
});
