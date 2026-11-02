// Sealing messages between a paired phone and computer (phone app, phase 1).
// libsodium's crypto_box (X25519 + XSalsa20-Poly1305) with a fresh random nonce per
// message, sent in front of the ciphertext. No home-made cryptography: only libsodium.
// Keys and sealed frames are base64url text.
import sodium from 'libsodium-wrappers';

let ready: Promise<typeof sodium> | null = null;
function lib(): Promise<typeof sodium> {
  if (!ready) ready = sodium.ready.then(() => sodium);
  return ready;
}

const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const s = await lib();
  const pair = s.crypto_box_keypair();
  return { publicKey: s.to_base64(pair.publicKey, B64()), privateKey: s.to_base64(pair.privateKey, B64()) };
}

export async function seal(message: Uint8Array, theirPublic: string, myPrivate: string): Promise<string> {
  const s = await lib();
  const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
  // A copy: bytes made in another realm (a test window, a worker) fail libsodium's own type check.
  const box = s.crypto_box_easy(Uint8Array.from(message), nonce, s.from_base64(theirPublic, B64()), s.from_base64(myPrivate, B64()));
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce, 0);
  out.set(box, nonce.length);
  return s.to_base64(out, B64());
}

/** The message, or null when the frame doesn't open with these keys (changed, wrong keys, not a frame). */
export async function open(sealed: string, theirPublic: string, myPrivate: string): Promise<Uint8Array | null> {
  const s = await lib();
  try {
    const raw = s.from_base64(sealed, B64());
    if (raw.length <= s.crypto_box_NONCEBYTES + s.crypto_box_MACBYTES) return null;
    const nonce = raw.subarray(0, s.crypto_box_NONCEBYTES);
    const box = raw.subarray(s.crypto_box_NONCEBYTES);
    return s.crypto_box_open_easy(box, nonce, s.from_base64(theirPublic, B64()), s.from_base64(myPrivate, B64()));
  } catch {
    return null;
  }
}

/** Seal for a receiver whose key we know, without a key of our own (crypto_box_seal): the
 *  phone's first message when pairing, so the relay can't read or swap the phone's key. */
export async function sealAnonymous(message: Uint8Array, theirPublic: string): Promise<string> {
  const s = await lib();
  return s.to_base64(s.crypto_box_seal(Uint8Array.from(message), s.from_base64(theirPublic, B64())), B64());
}

export async function openAnonymous(sealed: string, mine: { publicKey: string; privateKey: string }): Promise<Uint8Array | null> {
  const s = await lib();
  try {
    return s.crypto_box_seal_open(s.from_base64(sealed, B64()), s.from_base64(mine.publicKey, B64()), s.from_base64(mine.privateKey, B64()));
  } catch {
    return null;
  }
}
