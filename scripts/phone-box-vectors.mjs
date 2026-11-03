// Writes fixed samples made with libsodium (the phone's library) for the computer's Rust
// encryption to match (src-tauri/src/phone_box.rs): a crypto_box_easy frame with the nonce in
// front, and a crypto_box_seal frame, both base64url without padding as on the phone.
// Run: node scripts/phone-box-vectors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sodium from 'libsodium-wrappers';

await sodium.ready;
const B64 = sodium.base64_variants.URLSAFE_NO_PADDING;
const b64 = (u) => sodium.to_base64(u, B64);
// Fixed seeds, so the samples are the same every run.
const seed = (n) => new Uint8Array(32).fill(n);
const a = sodium.crypto_box_seed_keypair(seed(1));
const b = sodium.crypto_box_seed_keypair(seed(2));
const nonce = new Uint8Array(24).map((_, i) => i);
const message = 'Hello from the phone: {"kind":"call","id":"c1"} é';
const box = sodium.crypto_box_easy(sodium.from_string(message), nonce, b.publicKey, a.privateKey);
const framed = new Uint8Array(nonce.length + box.length);
framed.set(nonce, 0);
framed.set(box, nonce.length);
const anonymous = sodium.crypto_box_seal(sodium.from_string(message), b.publicKey);

const out = {
  note: 'Made by scripts/phone-box-vectors.mjs with libsodium; A seals to B. The sealed box changes each run (its key is random).',
  a: { publicKey: b64(a.publicKey), privateKey: b64(a.privateKey) },
  b: { publicKey: b64(b.publicKey), privateKey: b64(b.privateKey) },
  nonce: b64(nonce),
  message,
  framed: b64(framed),
  sealedToB: b64(anonymous),
};
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'tests', 'fixtures', 'phone_box_vectors.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${file}`);
