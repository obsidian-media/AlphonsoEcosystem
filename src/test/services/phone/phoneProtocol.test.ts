import { describe, it, expect } from 'vitest';
import { generateKeyPair } from '../../../services/phone/phoneCrypto';
import {
  PHONE_MAX_FRAME_BYTES, PHONE_PROTOCOL_VERSION, decodeMessage, encodeMessage, pairingPayload, readPairingPayload, sealPairingRequest, openPairingRequest, type PhoneMessage,
} from '../../../services/phone/phoneProtocol';

describe('phoneProtocol', () => {
  it('the pairing payload round-trips and refuses an unknown version', () => {
    const info = { computerId: 'c-1', computerPublicKey: 'pk', computerName: 'Studio PC', relayUrl: 'wss://relay.example', pairingSecret: 's3cret' };
    const text = pairingPayload(info);
    expect(readPairingPayload(text)).toEqual({ ...info, version: PHONE_PROTOCOL_VERSION });
    const other = JSON.parse(text.replace(/^alphonso-pair:/, ''));
    expect(readPairingPayload('alphonso-pair:' + JSON.stringify({ ...other, version: PHONE_PROTOCOL_VERSION + 1 }))).toBeNull();
    expect(readPairingPayload('https://example.com')).toBeNull();
    expect(readPairingPayload('alphonso-pair:{broken')).toBeNull();
  });

  it('a message encodes and decodes between the paired keys', async () => {
    const computer = await generateKeyPair();
    const phone = await generateKeyPair();
    const msg: PhoneMessage = { id: 'm1', kind: 'call', name: 'request.stop', args: { requestId: 'r1' } };
    const frame = await encodeMessage(msg, { theirPublic: computer.publicKey, myPrivate: phone.privateKey });
    expect(await decodeMessage(frame, { theirPublic: phone.publicKey, myPrivate: computer.privateKey })).toEqual(msg);
  });

  it('a decoded frame that is not a known message is refused', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const frame = await encodeMessage({ id: 'x', kind: 'nonsense' } as unknown as PhoneMessage, { theirPublic: a.publicKey, myPrivate: b.privateKey }).catch(() => null);
    if (frame) expect(await decodeMessage(frame, { theirPublic: b.publicKey, myPrivate: a.privateKey })).toBeNull();
  });

  it('a message larger than 4 MB is refused before sealing', async () => {
    expect(PHONE_MAX_FRAME_BYTES).toBe(4 * 1024 * 1024);
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const big: PhoneMessage = { id: 'big', kind: 'change', store: 'requests', data: 'x'.repeat(PHONE_MAX_FRAME_BYTES), version: 1 };
    await expect(encodeMessage(big, { theirPublic: a.publicKey, myPrivate: b.privateKey })).rejects.toThrow(/too large/i);
  });
});

describe('pairing request', () => {
  it("the phone's first message carries its key, sealed so only the computer can read it", async () => {
    const computer = await generateKeyPair();
    const phone = await generateKeyPair();
    const sealed = await sealPairingRequest({ phonePublicKey: phone.publicKey, pairingSecret: 's3cret', phoneName: 'Ann iPhone' }, computer.publicKey);
    expect(sealed).not.toContain(phone.publicKey);
    expect(await openPairingRequest(sealed, computer)).toEqual({ phonePublicKey: phone.publicKey, pairingSecret: 's3cret', phoneName: 'Ann iPhone' });
    const other = await generateKeyPair();
    expect(await openPairingRequest(sealed, other)).toBeNull();
    expect(await openPairingRequest('garbage', computer)).toBeNull();
  });
});
