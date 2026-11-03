// The sign-in page's two checks: what Alphonso on this computer asked for (a local port and
// a one-time code, both in the address it opened), and where the sign-in goes back: only
// http://127.0.0.1 on that port, which never leaves the computer; Alphonso's answer there
// removes the address from the browser's history.
export const BAD_REQUEST = "This page is opened by Alphonso on your computer. In Alphonso, open Settings → Runtime → Remote Access → Phones and choose Sign in.";
const METHODS = new Set(['', 'google', 'apple', 'email']);

export function readRequest(search) {
  const q = new URLSearchParams(search);
  const port = Number(q.get('port'));
  const state = q.get('state') || '';
  const method = q.get('method') || '';
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, reason: BAD_REQUEST };
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return { ok: false, reason: BAD_REQUEST };
  if (!METHODS.has(method)) return { ok: false, reason: BAD_REQUEST };
  return { ok: true, port, state, method, email: q.get('email') || '' };
}

export function handoffUrl(request, refreshToken) {
  const query = new URLSearchParams({ state: request.state, token: refreshToken });
  return `http://127.0.0.1:${request.port}/callback?${query.toString()}`;
}
