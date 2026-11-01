// Settings → Phones (phone app, phase 1): sign in, pair a phone by QR code, see paired
// phones and remove one, and switch phone access on or off.
import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '../ui';
import {
  listPhones, pairingQr, phoneAccessOn, removePhone, setPhoneAccess, startPhoneLink, webSocketFactory, type PairedPhone,
} from '../../services/phone/phoneLink';
import {
  isSignedIn, phoneAccessAvailable, phoneAuth, phoneRelayUrl, signInComputer, signedInEmail, type SignInMethod,
} from '../../services/phone/phoneAccount';

function lastUsed(ms: number | null): string {
  if (!ms) return 'Not used yet';
  const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (min < 1) return 'Last used just now';
  if (min < 60) return `Last used ${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `Last used ${h} h ago` : `Last used ${new Date(ms).toLocaleDateString()}`;
}

export function PhonesSection({ computerName = 'This computer' }: { computerName?: string }) {
  const [phones, setPhones] = useState<PairedPhone[]>(() => listPhones());
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [choosing, setChoosing] = useState(false);
  const [email, setEmail] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [access, setAccess] = useState(phoneAccessOn());
  const [message, setMessage] = useState<string | null>(null);
  const available = phoneAccessAvailable();
  const relayUrl = phoneRelayUrl();

  // Signed in earlier? The keychain knows; ask once when the section opens.
  useEffect(() => {
    let live = true;
    void phoneAuth.idToken().then((t) => { if (live && t) setSignedIn(true); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!qr || !relayUrl) return undefined;
    const stop = startPhoneLink({ relayUrl, auth: phoneAuth, socket: webSocketFactory });
    const poll = setInterval(() => {
      const now = listPhones();
      setPhones(now);
      if (now.length > phones.length) { setQr(null); setAccess(phoneAccessOn()); }
    }, 1000);
    return () => { clearInterval(poll); if (!phoneAccessOn()) stop(); };
  }, [qr, relayUrl, phones.length]);

  if (!available.ok || !relayUrl) {
    return <section data-testid="phones-section"><h3 className="text-sm font-semibold">Phones</h3><p className="text-xs text-[var(--text-muted)]">{available.reason}</p></section>;
  }

  const signIn = async (method: SignInMethod) => {
    const result = await signInComputer(method, method === 'email' ? email : undefined);
    if (result.ok) { setSignedIn(true); setChoosing(false); setMessage(null); } else setMessage(result.reason || 'Sign-in did not finish.');
  };

  return (
    <section data-testid="phones-section" className="space-y-3">
      <h3 className="text-sm font-semibold">Phones</h3>
      {!signedIn && !choosing && <Button onClick={() => setChoosing(true)}>Sign in to pair a phone</Button>}
      {!signedIn && choosing && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => signIn('apple')}>Apple</Button>
          <Button onClick={() => signIn('google')}>Google</Button>
          <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="rounded border px-2 py-1 text-xs" />
          <Button onClick={() => signIn('email')} disabled={!email.includes('@')}>Email me a link</Button>
        </div>
      )}
      {signedIn && <p className="text-xs text-[var(--text-muted)]">Signed in as {signedInEmail()}</p>}
      {signedIn && !qr && (
        <Button onClick={async () => setQr(await pairingQr({ relayUrl, computerName }))}>Pair a phone</Button>
      )}
      {qr && (
        <div className="space-y-2">
          <p className="text-xs">Scan this with the Alphonso app. It works once, for 10 minutes.</p>
          <div data-testid="phone-pairing-qr" className="inline-block rounded bg-white p-2"><QRCodeCanvas value={qr} size={180} /></div>
        </div>
      )}
      {phones.length > 0 && (
        <ul className="space-y-1">
          {phones.map((p) => (
            <li key={p.deviceId} className="flex items-center gap-3 text-xs">
              <span className="font-medium">{p.name}</span>
              <span className="text-[var(--text-muted)]">{lastUsed(p.lastSeenMs)}</span>
              {confirming === p.deviceId ? (
                <>
                  <span>Remove {p.name}? It won't reach this computer again.</span>
                  <Button onClick={async () => { await removePhone(p.deviceId, { relayUrl, auth: phoneAuth }); setConfirming(null); setPhones(listPhones()); setAccess(phoneAccessOn()); }}>Yes, remove</Button>
                  <Button onClick={() => setConfirming(null)}>Cancel</Button>
                </>
              ) : (
                <Button onClick={() => setConfirming(p.deviceId)}>Remove</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {phones.length > 0 && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={access} onChange={(e) => { setPhoneAccess(e.target.checked); setAccess(phoneAccessOn()); }} />
          Phone access
        </label>
      )}
      {message && <p className="text-xs text-[var(--danger,#e11d48)]">{message}</p>}
    </section>
  );
}
