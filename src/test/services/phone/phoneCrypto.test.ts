import { describe, it, expect } from 'vitest';
import { generateKeyPair, seal, open, sealAnonymous, openAnonymous } from '../../../services/phone/phoneCrypto';

const text = (s: string) => new TextEncoder().encode(s);

describe('phoneCrypto', () => {
  it('a sealed message opens with the right keys', async () => {
    const computer = await generateKeyPair();
    const phone = await generateKeyPair();
    const sealed = await seal(text('approve hector'), computer.publicKey, phone.privateKey);
    const opened = await open(sealed, phone.publicKey, computer.privateKey);
    expect(new TextDecoder().decode(opened as Uint8Array)).toBe('approve hector');
  });

  it("a sealed message does not open with another phone's keys", async () => {
    const computer = await generateKeyPair();
    const phone = await generateKeyPair();
    const other = await generateKeyPair();
    const sealed = await seal(text('hello'), computer.publicKey, phone.privateKey);
    expect(await open(sealed, other.publicKey, computer.privateKey)).toBeNull();
  });

  it('a frame changed by one byte does not open', async () => {
    const computer = await generateKeyPair();
    const phone = await generateKeyPair();
    const sealed = await seal(text('hello'), computer.publicKey, phone.privateKey);
    const i = Math.floor(sealed.length / 2);
    const changed = sealed.slice(0, i) + (sealed[i] === 'A' ? 'B' : 'A') + sealed.slice(i + 1);
    expect(await open(changed, phone.publicKey, computer.privateKey)).toBeNull();
  });

  it('two seals of the same message differ (a fresh nonce each time)', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    expect(await seal(text('x'), a.publicKey, b.privateKey)).not.toBe(await seal(text('x'), a.publicKey, b.privateKey));
  });

  it('garbage does not open and does not throw', async () => {
    const a = await generateKeyPair();
    expect(await open('not-a-frame', a.publicKey, a.privateKey)).toBeNull();
  });
});

describe('anonymous seal (the first message of a pairing)', () => {
  it('opens only with the receiver keys', async () => {
    const computer = await generateKeyPair();
    const sealed = await sealAnonymous(text('hi'), computer.publicKey);
    expect(new TextDecoder().decode((await openAnonymous(sealed, computer)) as Uint8Array)).toBe('hi');
    expect(await openAnonymous(sealed, await generateKeyPair())).toBeNull();
  });
});
