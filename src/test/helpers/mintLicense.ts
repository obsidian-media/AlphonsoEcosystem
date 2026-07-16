/**
 * Test helper: mint signed license tokens with a locally generated ECDSA P-256
 * key pair so the new signature-verified licenseService can be exercised
 * end-to-end (generate keys -> inject public JWK -> sign token -> activate).
 */

export interface LicenseKeypair {
  keyPair: CryptoKeyPair;
  publicJwk: JsonWebKey;
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateLicenseKeypair(): Promise<LicenseKeypair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { keyPair, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } as JsonWebKey };
}

export async function mintLicenseToken(
  keyPair: CryptoKeyPair,
  payload: Record<string, unknown>
): Promise<string> {
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    new TextEncoder().encode(payloadB64)
  );
  return `${payloadB64}.${b64url(new Uint8Array(sig))}`;
}
