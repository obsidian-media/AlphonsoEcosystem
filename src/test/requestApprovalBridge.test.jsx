import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// App.tsx pulls in the whole app shell; only the bridge is under test here.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));

import { RequestApprovalProvider, useRequestApprovalBridge } from '../App';

function mountBridge() {
  const ref = { current: null };
  function Probe() {
    ref.current = useRequestApprovalBridge();
    return null;
  }
  render(
    <RequestApprovalProvider>
      <Probe />
    </RequestApprovalProvider>
  );
  return ref;
}

describe('RequestApprovalProvider bridge', () => {
  it('fails closed (resolves false, never hangs) before any approval handler is registered', async () => {
    const bridge = mountBridge();
    await expect(bridge.current.requestApproval({ actionLabel: 'x', requireApproval: true })).resolves.toBe(false);
  });

  it('forwards the whole request object to the registered handler and returns its decision', async () => {
    const bridge = mountBridge();
    const handler = vi.fn().mockResolvedValue(true);
    act(() => bridge.current.registerApprovalHandler(handler));
    const request = { actionLabel: 'hector wants Hermes', agent: 'hector', riskLevel: 'high', requireApproval: true };
    await expect(bridge.current.requestApproval(request)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it('denies again once the handler is unregistered', async () => {
    const bridge = mountBridge();
    act(() => bridge.current.registerApprovalHandler(vi.fn().mockResolvedValue(true)));
    act(() => bridge.current.registerApprovalHandler(null));
    await expect(bridge.current.requestApproval({ actionLabel: 'x' })).resolves.toBe(false);
  });
});
