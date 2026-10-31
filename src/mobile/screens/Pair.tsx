import React, { useState } from 'react';

export function PairScreen({ pair, scanQr, onPaired }: { pair: (qr: string) => Promise<{ ok: boolean; reason?: string }>; scanQr?: () => Promise<string | null>; onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tryPair = async (text: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await pair(text.trim());
      if (result.ok) onPaired(); else setMessage(result.reason || "It didn't pair.");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6 text-sm">
      <h1 className="text-lg font-semibold">Pair with your computer</h1>
      <p className="text-(--text-2)">On your computer, open Settings → Runtime → Remote Access → Phones and choose Pair a phone.</p>
      {scanQr && (
        <button type="button" disabled={busy} onClick={async () => { const text = await scanQr(); if (text) await tryPair(text); }} className="rounded-lg bg-(--accent) py-3 text-white">Scan the QR code</button>
      )}
      <input aria-label="Pairing code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Or paste the pairing code" className="rounded-lg border border-(--border) px-3 py-3" />
      <button type="button" disabled={busy || !code.trim()} onClick={() => tryPair(code)} className="rounded-lg bg-(--surface-3) py-3">Pair</button>
      {message && <p role="status" className="text-(--danger)">{message}</p>}
    </div>
  );
}
