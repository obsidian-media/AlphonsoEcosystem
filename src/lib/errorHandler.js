import { useToast } from '../components/ToastProvider';
import { appendVerificationLog } from '../services/verificationService';
import { TRUST_STATES } from '../services/trustModel';

export function handleAsyncError(error, context) {
  const message = error?.message || String(error);
  console.error(`[Alphonso] ${context}:`, message);
  // Append to verification logs for audit trail
  try {
    appendVerificationLog({
      stage: context,
      status: 'failed',
      trust: TRUST_STATES.FAILED,
      error: message,
      timestamp: Date.now()
    });
  } catch { /* don't recurse */ }
}
