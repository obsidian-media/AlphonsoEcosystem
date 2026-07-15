/**
 * Vendor license-signing trust anchor.
 *
 * This is the PUBLIC half of an ECDSA P-256 key pair. The matching PRIVATE key
 * is generated and held by the vendor (never committed, never shipped) and is
 * used by `scripts/issue-license.mjs` to mint signed license tokens.
 *
 * Security model (offline signed tokens):
 *   - A license is a token `base64url(payload).base64url(signature)`.
 *   - `licenseService.verifyLicenseToken()` verifies the signature against the
 *     public key below and checks expiry. Only a token signed by the vendor's
 *     private key can unlock a paid tier — editing localStorage or typing a
 *     format-matching string no longer does anything.
 *   - This is a client-side control, so it deters casual bypass (fake keys,
 *     storage tampering); it cannot stop an attacker who patches the app
 *     binary. That is an inherent limit of offline licensing, documented here
 *     rather than hidden.
 *
 * FAIL-CLOSED: while this is `null`, every paid tier stays locked, even for a
 * legitimate token — the vendor MUST paste their real public JWK here (output
 * of `node scripts/issue-license.mjs --generate-keys`) before shipping paid
 * builds. Keeping the placeholder null is the safe default: it never grants a
 * tier it cannot cryptographically prove.
 */
export const LICENSE_TRUST_KEY: JsonWebKey | null = null;
