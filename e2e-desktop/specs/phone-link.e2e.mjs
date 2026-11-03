// Phone pairing in the real desktop app (2026-11-03). The window's security policy blocks
// libsodium's WebAssembly, so the computer's phone encryption is the backend's
// (src-tauri/src/phone_box.rs). This checks, in the built app, that it speaks exactly the
// phone's libsodium both ways, that its private key stays out of the window, and that
// Settings → Runtime → Remote Access shows the Phones section without an error.
// Nothing is sent to the relay.
import sodium from 'libsodium-wrappers';
import { enterShell, invoke, mainText } from '../helpers.mjs';

const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;
const ok = (result, what) => {
  if (!result?.ok) throw new Error(`${what} failed: ${result?.error}`);
  return result.value;
};

describe('Phone link through the backend', () => {
  let appPublic;
  let phone;

  before(async () => {
    await sodium.ready;
    await enterShell();
    phone = sodium.crypto_box_keypair();
  });

  it("gives the window this computer's public key, the same each time", async () => {
    appPublic = ok(await invoke('phone_link_public_key'), 'phone_link_public_key');
    expect(appPublic).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ok(await invoke('phone_link_public_key'), 'phone_link_public_key again')).toBe(appPublic);
  });

  it("seals for a phone so the phone's libsodium opens it", async () => {
    const theirPublic = sodium.to_base64(phone.publicKey, B64());
    const sealed = ok(await invoke('phone_seal', { message: 'Hello phone é', theirPublic }), 'phone_seal');
    const raw = sodium.from_base64(sealed, B64());
    const nonce = raw.subarray(0, sodium.crypto_box_NONCEBYTES);
    const box = raw.subarray(sodium.crypto_box_NONCEBYTES);
    const opened = sodium.crypto_box_open_easy(box, nonce, sodium.from_base64(appPublic, B64()), phone.privateKey);
    expect(sodium.to_string(opened)).toBe('Hello phone é');
  });

  it("opens what the phone's libsodium sealed, and its pairing request", async () => {
    const appKey = sodium.from_base64(appPublic, B64());
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const box = sodium.crypto_box_easy(sodium.from_string('Hello computer'), nonce, appKey, phone.privateKey);
    const framed = new Uint8Array(nonce.length + box.length);
    framed.set(nonce, 0);
    framed.set(box, nonce.length);
    const theirPublic = sodium.to_base64(phone.publicKey, B64());
    const opened = await invoke('phone_open', { sealed: sodium.to_base64(framed, B64()), theirPublic });
    expect(ok(opened, 'phone_open')).toBe('Hello computer');

    const request = sodium.crypto_box_seal(sodium.from_string('{"pairingSecret":"s"}'), appKey);
    const pairing = await invoke('phone_open_anonymous', { sealed: sodium.to_base64(request, B64()) });
    expect(ok(pairing, 'phone_open_anonymous')).toBe('{"pairingSecret":"s"}');

    const wrong = await invoke('phone_open', { sealed: sodium.to_base64(framed, B64()), theirPublic: appPublic });
    expect(ok(wrong, 'phone_open with the wrong key')).toBeNull();
  });

  it("won't hand its private key to the window", async () => {
    const read = await invoke('secure_credential_get', { key: 'alphonso_phone_link_private_key' });
    expect(read.ok).toBe(false);
    expect(read.error).toMatch(/kept by the app itself/);
  });

  it('shows the Phones section in Settings without an error', async () => {
    await $('[aria-label="Open settings"]').click();
    const runtime = await $('//nav//button[normalize-space(.)="Runtime"]');
    await runtime.waitForClickable({ timeout: 30000 });
    await runtime.click();
    const section = await $('[data-testid="phones-section"]');
    await section.waitForExist({ timeout: 30000 });
    expect(await mainText()).not.toMatch(/Couldn't make the pairing code/);
  });
});
