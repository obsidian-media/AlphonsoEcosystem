import React, { useRef, useState } from 'react';
import { Button } from './ui';
import { chooseMetaPage, finishPastedSignIn, signIn, type MetaPage } from '../services/signInService';
import { getConnectorCredential, saveConnectorCredential } from '../services/connectors/connectorAuth';
import { savedInstagramRoute, setInstagramRoute, type InstagramRoute } from '../services/contentFactory/instagramRoute';
import type { SignInService } from '../services/contentFactory/signInExpiry';

const LABEL: Record<SignInService, { button: string; name: string }> = {
  youtube: { button: 'Sign in to YouTube', name: 'YouTube' },
  meta: { button: 'Sign in to Facebook', name: 'Facebook' },
  instagram: { button: 'Sign in with Instagram', name: 'Instagram' },
};

/** Step-by-step: what the user sets up in their own Google project or Meta app first. */
const STEPS: Record<SignInService, string[]> = {
  youtube: [
    'In Google Cloud Console, create a project and turn on the YouTube Data API v3.',
    'Under Credentials, create an OAuth client ID of type "Web application".',
    'Add this as an authorised redirect URI: http://localhost:8085/callback',
    'Paste the Client ID and Client Secret above and save, then sign in here.',
  ],
  meta: [
    'In Meta for Developers, create an app with Facebook Login for Business.',
    'Add this as a valid OAuth redirect URI: http://localhost:8086/callback',
    'Paste the App ID and App Secret above and save, then sign in here and choose your Page.',
  ],
  instagram: [
    'In your Meta app, add the Instagram product ("API setup with Instagram login").',
    'Add this as a redirect URL: http://localhost:8087/callback',
    'Paste the Instagram App ID and App Secret below and save, then sign in here.',
  ],
};

/**
 * Sign in from Settings (content factory phase 3c): opens the browser, and Alphonso
 * receives the sign-in itself. While it waits, a pasted address can finish it.
 */
export function SignInButton({ service }: { service: SignInService }): React.JSX.Element {
  const [waiting, setWaiting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState('');
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [pageId, setPageId] = useState('');
  const label = LABEL[service];
  // Which sign-in attempt is current: once one finishes (by the browser or a pasted
  // address), a later answer from the same attempt is ignored.
  const attempt = useRef(0);
  const settled = useRef(0);

  const done = (outcome: { ok: boolean; reason?: string; pages?: MetaPage[]; note?: string }, which: number) => {
    if (which !== attempt.current || settled.current === which) return;
    settled.current = which;
    setWaiting(false);
    if (!outcome.ok) { setMessage(outcome.reason || 'The sign-in did not finish.'); return; }
    if (outcome.pages?.length) {
      setPages(outcome.pages);
      setPageId(outcome.pages[0].id);
      setMessage('Signed in. Choose the Facebook Page to post to.');
      return;
    }
    setMessage(outcome.note || `Signed in to ${label.name}.`);
  };
  const start = () => {
    attempt.current += 1;
    const which = attempt.current;
    setWaiting(true);
    setMessage('Waiting for the browser (5 minutes at most)…');
    setPages([]);
    signIn(service).then((o) => done(o, which), () => done({ ok: false }, which));
  };
  const finish = () => {
    const which = attempt.current;
    // A wrong address says why; the browser can still come back, so the attempt goes on.
    const pastedDone = (o: { ok: boolean; reason?: string; pages?: MetaPage[]; note?: string }) => {
      if (o.ok) done(o, which);
      else if (which === attempt.current && settled.current !== which) setMessage(o.reason || 'That address did not finish the sign-in.');
    };
    finishPastedSignIn(service, pasted).then(pastedDone, () => pastedDone({ ok: false }));
  };

  return (
    <div className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-[11px] text-(--text-2)" data-testid={`sign-in-${service}`}>
      <ol className="list-decimal space-y-0.5 pl-4 text-(--text-3)">
        {STEPS[service].map((step) => <li key={step}>{step}</li>)}
      </ol>
      <Button size="sm" onClick={start} disabled={waiting}>{label.button}</Button>
      {waiting && (
        <div className="space-y-1">
          <label className="block">
            If the browser shows an error page instead of coming back, copy its address and paste it here.
            <input aria-label="The address the browser ended on" className="mt-1 w-full rounded-lg bg-(--surface-1) px-2 py-1 text-(--text-1)"
              value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </label>
          <Button size="sm" variant="secondary" disabled={!pasted.trim()} onClick={finish}>Finish signing in</Button>
        </div>
      )}
      {pages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Facebook Page to post to" className="rounded-lg bg-(--surface-1) px-2 py-1 text-(--text-1)" value={pageId} onChange={(e) => setPageId(e.target.value)}>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
          </select>
          <Button size="sm" variant="secondary" onClick={() => {
            const page = pages.find((p) => p.id === pageId);
            if (page) { chooseMetaPage(page); setPages([]); setMessage(`Signed in to Facebook: posting to ${page.name || page.id}.`); }
          }}>Use this Page</Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

/**
 * Instagram Login (phase 3c): an Instagram professional account with no Facebook Page,
 * and the choice of which way Alphonso posts to Instagram.
 */
export function InstagramLoginSection(): React.JSX.Element {
  const [appId, setAppId] = useState(() => String(getConnectorCredential('meta', 'INSTAGRAM_APP_ID') || ''));
  const [appSecret, setAppSecret] = useState(() => String(getConnectorCredential('meta', 'INSTAGRAM_APP_SECRET') || ''));
  const [route, setRoute] = useState<InstagramRoute | ''>(() => savedInstagramRoute() || '');
  const [notice, setNotice] = useState('');
  const field = 'mt-1 w-full rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-[12px] text-(--text-1)';

  return (
    <div className="space-y-2 rounded-xl border border-pink-300/20 bg-pink-500/8 p-3" data-testid="instagram-login-section">
      <h4 className="text-[13px] font-semibold text-pink-400">Instagram Login (no Facebook Page)</h4>
      <p className="text-[11px] text-(--text-3)">
        For an Instagram professional account without a Facebook Page. Posts on this route go by a link, so Reels and
        carousels use your storage (or are saved to post by hand). Alphonso renews the sign-in before its 60 days run out.
      </p>
      <label className="block text-[11px] text-(--text-2)">
        Instagram App ID
        <input aria-label="Instagram App ID" className={field} value={appId} onChange={(e) => setAppId(e.target.value)} />
      </label>
      <label className="block text-[11px] text-(--text-2)">
        Instagram App Secret
        <input aria-label="Instagram App Secret" type="password" className={field} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
      </label>
      <Button size="sm" onClick={() => {
        if (!appId.trim() || !appSecret.trim()) { setNotice('Fill in the Instagram App ID and App Secret.'); return; }
        saveConnectorCredential('meta', 'INSTAGRAM_APP_ID', appId.trim());
        saveConnectorCredential('meta', 'INSTAGRAM_APP_SECRET', appSecret.trim());
        setNotice('Instagram app saved.');
      }}>Save Instagram app</Button>
      {notice && <p role="status" className="text-[11px] text-(--text-2)">{notice}</p>}
      <SignInButton service="instagram" />
      <label className="block text-[11px] text-(--text-2)">
        Post to Instagram
        <select aria-label="Post to Instagram" className={field} value={route}
          onChange={(e) => { const next = (e.target.value || null) as InstagramRoute | null; setRoute(next || ''); setInstagramRoute(next); }}>
          <option value="">Whichever is set up (the Facebook Page first)</option>
          <option value="page">Through my Facebook Page</option>
          <option value="instagram_login">Through Instagram Login</option>
        </select>
      </label>
    </div>
  );
}
