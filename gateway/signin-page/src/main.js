// The Alphonso sign-in page (Firebase Hosting). Alphonso on the computer opens it with a local
// port and a one-time code; the person signs in with Google, Apple (when set up for the web)
// or an email link; the page then sends the sign-in back to http://127.0.0.1 on that port and
// keeps nothing itself (in-memory sign-in only).
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, OAuthProvider, browserPopupRedirectResolver, inMemoryPersistence, initializeAuth,
  isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink, signInWithPopup,
} from 'firebase/auth';
import { BAD_REQUEST, handoffUrl, readRequest } from './handoff.js';

const PENDING_KEY = 'alphonso_signin_pending';
const env = import.meta.env;
const app = initializeApp({
  apiKey: env.VITE_FB_API_KEY,
  authDomain: env.VITE_FB_AUTH_DOMAIN,
  projectId: env.VITE_FB_PROJECT_ID,
  appId: env.VITE_FB_APP_ID,
});
const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });

const $ = (id) => document.getElementById(id);
const say = (text, error = false) => { $('status').textContent = text; $('status').className = error ? 'error' : ''; };
const busy = (on) => { for (const id of ['google', 'apple', 'send']) $(id).disabled = on; };

function finish(request, user) {
  say('Signed in. Returning to Alphonso…');
  window.location.replace(handoffUrl(request, user.refreshToken));
}

function plain(error) {
  const code = error?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'The browser blocked the sign-in window. Allow pop-ups for this page and try again.';
  if (code === 'auth/account-exists-with-different-credential') return 'This email already uses another way to sign in. Use that one.';
  if (code === 'auth/invalid-action-code') return 'That email link has expired or was already used. Ask for a new one.';
  if (code === 'auth/operation-not-allowed') return "That way of signing in isn't set up for this page yet.";
  return 'Sign-in did not finish. Try again.';
}

async function withPopup(request, provider) {
  busy(true);
  try { finish(request, (await signInWithPopup(auth, provider)).user); } catch (e) { say(plain(e), true); busy(false); }
}

async function start() {
  // Coming back from the email link: finish the sign-in Alphonso started.
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { pending = null; }
    localStorage.removeItem(PENDING_KEY);
    if (!pending?.request || !pending?.email) { say('Open the link in the same browser where you asked for it.', true); return; }
    try { finish(pending.request, (await signInWithEmailLink(auth, pending.email, window.location.href)).user); } catch (e) { say(plain(e), true); }
    return;
  }

  const request = readRequest(window.location.search);
  if (!request.ok) { $('intro').hidden = true; say(BAD_REQUEST, true); return; }
  // The address carried the one-time code; keep it out of the browser's history.
  window.history.replaceState(null, '', window.location.pathname);
  $('choices').hidden = false;
  $('apple').hidden = env.VITE_SIGNIN_APPLE !== 'on';
  $('email').value = request.email;
  $('google').onclick = () => withPopup(request, new GoogleAuthProvider());
  $('apple').onclick = () => withPopup(request, new OAuthProvider('apple.com'));
  $('send').onclick = async () => {
    const email = $('email').value.trim();
    if (!email.includes('@')) { say('Type your email first.', true); return; }
    busy(true);
    try {
      await sendSignInLinkToEmail(auth, email, { url: `${window.location.origin}/`, handleCodeInApp: true });
      localStorage.setItem(PENDING_KEY, JSON.stringify({ request, email }));
      say(`Check ${email} and open the link from Alphonso in this browser.`);
    } catch (e) { say(plain(e), true); busy(false); }
  };
  if (request.method === 'apple' && $('apple').hidden) say("Signing in with Apple isn't set up on the web yet. Use Google or an email link with the same email as your phone.", true);
  if (request.method === 'google') $('google').focus();
}

void start();
