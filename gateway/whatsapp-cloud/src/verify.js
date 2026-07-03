import crypto from 'node:crypto';

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyChallenge({ mode, token, expectedToken, challenge }) {
  return Boolean(mode === 'subscribe' && token && expectedToken && constantTimeEqual(token, expectedToken) && challenge);
}

export function verifySignature({ rawBody, signatureHeader, appSecret }) {
  if (!rawBody || !signatureHeader || !appSecret) {
    return { ok: false, reason: 'missing_signature_material' };
  }

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  if (expected.length !== signatureHeader.length) {
    return { ok: false, expected, received: signatureHeader, reason: 'signature_length_mismatch' };
  }
  return {
    ok: crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader)),
    expected,
    received: signatureHeader
  };
}
