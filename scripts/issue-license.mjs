#!/usr/bin/env node
/**
 * Alphonso license issuance tool (vendor-only).
 *
 * Offline ECDSA P-256 signed license tokens. The private key lives ONLY on the
 * vendor's machine — never commit it, never ship it. The app verifies tokens
 * with the matching public key in `src/config/licenseTrustKey.ts`.
 *
 * Usage:
 *   # 1) One-time: generate a key pair.
 *   node scripts/issue-license.mjs --generate-keys
 *       -> writes license-signing-key.private.json (KEEP SECRET, gitignored)
 *       -> prints the PUBLIC JWK to paste into src/config/licenseTrustKey.ts
 *
 *   # 2) Mint a license for a customer.
 *   node scripts/issue-license.mjs --sign \
 *        --tier pro --sub "customer@example.com" --exp 365 \
 *        --key license-signing-key.private.json
 *       -> prints the license token to give the customer
 *
 * Flags:
 *   --tier   pro | enterprise            (required for --sign)
 *   --sub    customer identifier/email   (optional, recorded in the token)
 *   --exp    days-from-now OR ISO date   (optional; omit for a perpetual token)
 *   --lid    explicit license id         (optional; defaults to a random id)
 *   --key    path to the private JWK     (default: license-signing-key.private.json)
 *   --out    write token to a file       (optional; default: stdout)
 */
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', hash: { name: 'SHA-256' } };

function argOf(name, fallback = undefined) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateKeys() {
  const kp = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const publicJwk = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };
  const privPath = argOf('--key', 'license-signing-key.private.json');
  writeFileSync(privPath, JSON.stringify(priv, null, 2));
  console.log(`\nPrivate key written to ${privPath} — KEEP THIS SECRET (it is gitignored).`);
  console.log('\nPaste this PUBLIC key into src/config/licenseTrustKey.ts as LICENSE_TRUST_KEY:\n');
  console.log(`export const LICENSE_TRUST_KEY: JsonWebKey | null = ${JSON.stringify(publicJwk)};\n`);
}

async function sign() {
  const tier = argOf('--tier');
  if (tier !== 'pro' && tier !== 'enterprise') {
    console.error('error: --tier must be "pro" or "enterprise"');
    process.exit(1);
  }
  const keyPath = argOf('--key', 'license-signing-key.private.json');
  let privJwk;
  try {
    privJwk = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    console.error(`error: could not read private key at ${keyPath} (run --generate-keys first)`);
    process.exit(1);
  }

  let exp = null;
  const expArg = argOf('--exp');
  if (expArg) {
    const asNum = Number(expArg);
    exp = Number.isFinite(asNum)
      ? Date.now() + asNum * 24 * 60 * 60 * 1000
      : new Date(expArg).getTime();
    if (!Number.isFinite(exp)) {
      console.error('error: --exp must be a number of days or an ISO date');
      process.exit(1);
    }
  }

  const payload = {
    v: 1,
    tier,
    sub: argOf('--sub') || undefined,
    iat: Date.now(),
    exp,
    lid: argOf('--lid') || `AL-${b64url(crypto.getRandomValues(new Uint8Array(9)))}`
  };

  const key = await crypto.subtle.importKey('jwk', privJwk, ALGO, false, ['sign']);
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(SIGN_ALGO, key, new TextEncoder().encode(payloadB64));
  const token = `${payloadB64}.${b64url(sig)}`;

  const out = argOf('--out');
  if (out) {
    writeFileSync(out, token);
    console.log(`License token written to ${out}`);
  } else {
    console.log(token);
  }
}

(async () => {
  if (hasFlag('--generate-keys')) return generateKeys();
  if (hasFlag('--sign')) return sign();
  console.log('Usage: node scripts/issue-license.mjs --generate-keys | --sign --tier <pro|enterprise> [...]');
  console.log('See the header of this file for full options.');
})();
