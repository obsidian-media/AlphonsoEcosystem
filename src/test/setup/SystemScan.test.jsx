import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// importOriginal so the real withTimeout is preserved — SystemScan relies on
// it to bound checkPrerequisites, and the hanging-probe test below exercises
// that real timeout rather than a stub of it.
vi.mock('../../services/setupFlowService', async (importOriginal) => ({
  ...(await importOriginal()),
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

  it('keeps a good hardware result when only the prerequisite scan fails', async () => {
    // Regression: Promise.all discarded BOTH results if either rejected,
    // zeroing diskFreeGb, which RecommendedSetup then read as "disk full".
    scanHardware.mockResolvedValue({ ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null });
    checkPrerequisites.mockRejectedValue(new Error('prereq probe failed'));

    render(<SystemScan onContinue={() => {}} />);
    await waitFor(() => expect(screen.getByText(/220 ?GB free/i)).toBeInTheDocument());
    expect(screen.getByText(/16 ?GB RAM/i)).toBeInTheDocument();
  });

  it('reports unknown rather than zero when the hardware scan fails', async () => {
    scanHardware.mockRejectedValue(new Error('scan failed'));
    checkPrerequisites.mockResolvedValue({ missing: [], installHint: 'ok', dockerFound: true });

    render(<SystemScan onContinue={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0));
    // "0GB free" would be a lie that blocks installs downstream.
    expect(screen.queryByText(/0 ?GB free/i)).not.toBeInTheDocument();
  });

  it('still reaches a usable state when both probes hang (non-Tauri host)', async () => {
    // The real browser case: Tauri's invoke() never settles, so without the
    // per-probe timeout this sat on "Scanning your system…" forever — which
    // is exactly what broke the Playwright E2E suite.
    scanHardware.mockImplementation(() => new Promise(() => {}));
    checkPrerequisites.mockImplementation(() => new Promise(() => {}));

    render(<SystemScan onContinue={() => {}} />);
    await waitFor(
      () => expect(screen.getByText('Continue')).toBeInTheDocument(),
      { timeout: 15000 }
    );
  }, 20000);
});
