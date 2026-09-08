import { describe, expect, it, vi } from 'vitest';
import { handleAsyncError } from '../lib/errorHandler';

vi.mock('../components/ToastProvider', () => ({
  useToast: vi.fn(),
}));

vi.mock('../services/verificationService', () => ({
  appendVerificationLog: vi.fn(),
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { FAILED: 'failed', PENDING: 'pending' },
}));

describe('handleAsyncError', () => {
  it('logs error to console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('test error');
    handleAsyncError(error, 'test_context');
    expect(spy).toHaveBeenCalledWith('[Alphonso] test_context:', 'test error');
    spy.mockRestore();
  });

  it('handles non-Error objects', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleAsyncError('string error', 'ctx');
    expect(spy).toHaveBeenCalledWith('[Alphonso] ctx:', 'string error');
    spy.mockRestore();
  });

  it('handles null error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleAsyncError(null, 'ctx');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles undefined error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleAsyncError(undefined, 'ctx');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('appends to verification log', async () => {
    const { appendVerificationLog } = await import('../services/verificationService');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleAsyncError(new Error('fail'), 'audit_ctx');
    expect(appendVerificationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'audit_ctx',
        status: 'failed',
        trust: 'failed',
        error: 'fail',
      })
    );
    spy.mockRestore();
  });

  it('does not throw if verification log throws', async () => {
    const { appendVerificationLog } = await import('../services/verificationService');
    appendVerificationLog.mockImplementationOnce(() => { throw new Error('log error'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => handleAsyncError(new Error('x'), 'ctx')).not.toThrow();
    spy.mockRestore();
  });
});
