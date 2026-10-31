// Signing the computer in to the user's Obsidian Media account, for phone access (phone
// app, phase 1). The relay address comes from the build (VITE_PHONE_RELAY_URL); a build
// without one says phone access isn't available. Sign-in itself is a provider set at
// start: the Firebase one comes with the packaging spike (Task 1), which decides how
// Apple and Google sign-in open from a desktop window.
import type { PhoneAuth } from './phoneLink';

export type SignInMethod = 'apple' | 'google' | 'email';
export interface PhoneSignIn extends PhoneAuth {
  signedIn(): boolean;
  email(): string | null;
  signIn(method: SignInMethod, email?: string): Promise<{ ok: boolean; reason?: string }>;
  signOut(): Promise<void>;
}

export const NOT_AVAILABLE = "Phone access isn't available in this build yet.";

let provider: PhoneSignIn | null = null;
export function setPhoneSignInProvider(p: PhoneSignIn | null): void { provider = p; }

/** The relay's address from the build, or null. */
export function phoneRelayUrl(): string | null {
  const url = String(import.meta.env.VITE_PHONE_RELAY_URL || '').trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'wss:' || (u.protocol === 'ws:' && ['127.0.0.1', 'localhost'].includes(u.hostname)) ? url : null;
  } catch { return null; }
}

export function phoneAccessAvailable(): { ok: boolean; reason?: string } {
  return phoneRelayUrl() && provider ? { ok: true } : { ok: false, reason: NOT_AVAILABLE };
}

export function isSignedIn(): boolean { return !!provider?.signedIn(); }
export function signedInEmail(): string | null { return provider?.email() ?? null; }

export async function signInComputer(method: SignInMethod, email?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!provider) return { ok: false, reason: NOT_AVAILABLE };
  return provider.signIn(method, email);
}

export async function signOutComputer(): Promise<void> { await provider?.signOut(); }

export const phoneAuth: PhoneAuth = { idToken: async () => (provider ? provider.idToken() : null) };
