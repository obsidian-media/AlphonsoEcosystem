export const TRUST_STATES = {
  VERIFIED: 'verified',
  INFERRED: 'inferred',
  PENDING: 'pending',
  TEMPORARY: 'temporary',
  UNVERIFIED: 'unverified',
  USER_CONFIRMED: 'user_confirmed',
  FAILED: 'failed',
  STALE: 'stale',
  EXPIRED: 'expired',
  PLACEHOLDER: 'placeholder'
};

export function trustColor(trust) {
  switch (trust) {
    case TRUST_STATES.VERIFIED:
      return 'green';
    case TRUST_STATES.INFERRED:
      return 'blue';
    case TRUST_STATES.PENDING:
      return 'amber';
    case TRUST_STATES.TEMPORARY:
      return 'amber';
    case TRUST_STATES.USER_CONFIRMED:
      return 'green';
    case TRUST_STATES.FAILED:
      return 'red';
    case TRUST_STATES.STALE:
      return 'amber';
    case TRUST_STATES.EXPIRED:
      return 'zinc';
    case TRUST_STATES.PLACEHOLDER:
      return 'indigo';
    case TRUST_STATES.UNVERIFIED:
    default:
      return 'zinc';
  }
}

export function timestampMs() {
  return Date.now();
}
