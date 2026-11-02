import React, { useState } from 'react';
import type { PhoneSignIn, SignInMethod } from '../../services/phone/phoneAccount';

export function SignInScreen({ signIn, onSignedIn }: { signIn: PhoneSignIn; onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const go = async (method: SignInMethod) => {
    const result = await signIn.signIn(method, method === 'email' ? email : undefined);
    if (result.ok) onSignedIn(); else setMessage(result.reason || 'Sign-in did not finish.');
  };
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6 text-sm">
      <h1 className="text-lg font-semibold">Sign in to Alphonso</h1>
      <p className="text-(--text-2)">Use the same account as on your computer.</p>
      <button type="button" onClick={() => go('apple')} className="rounded-lg bg-(--surface-3) py-3">Continue with Apple</button>
      <button type="button" onClick={() => go('google')} className="rounded-lg bg-(--surface-3) py-3">Continue with Google</button>
      <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="rounded-lg border border-(--border) px-3 py-3" />
      <button type="button" disabled={!email.includes('@')} onClick={() => go('email')} className="rounded-lg bg-(--surface-3) py-3">Email me a link</button>
      {message && <p role="status" className="text-(--danger)">{message}</p>}
    </div>
  );
}
