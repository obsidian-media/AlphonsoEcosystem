import crypto from 'node:crypto';

export function verifyChallenge({ mode, token, expectedToken, challenge }) {
  return Boolean(mode === 'subscribe' && token && expectedToken && token === expectedToken && challenge);
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
