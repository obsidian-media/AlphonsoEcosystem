// The phone app's start: the desktop's styles and phone screens, with this phone's native
// parts. The theme follows the phone's light / dark setting.
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/styles/tokens.css';
import '@fontsource-variable/inter';
import '../../src/index.css';
import { MobileApp } from '../../src/mobile/MobileApp';
import { connectPhone, pairPhone } from '../../src/mobile/phoneSession';
import { webSocketFactory } from '../../src/services/phone/phoneLink';
import { setLinkOpener } from '../../src/services/browserAutomationService';
import { createSignIn, lock, networkKind, openInBrowser, notificationToken, onNotificationAction, phoneModel, phoneName, previewStore, scanQr, secrets, spikeHttp } from './native';
import { Phase4TestScreen } from '../../src/mobile/spike/Phase4TestScreen';

// Phone phase 4 test round (spike/phone-phase4, throwaway): a test build (VITE_PHONE_SPIKE=1) has a
// "Phase 4 test" button on every screen, so the test runs before pairing and with the computer off.
const SPIKE = import.meta.env.VITE_PHONE_SPIKE === '1';
function WithPhase4Test({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!SPIKE) return <>{children}</>;
  return (
    <>
      {open ? <div className="min-h-screen bg-(--surface-1) pt-[env(safe-area-inset-top)]"><button type="button" onClick={() => setOpen(false)} className="m-4 text-xs text-(--accent)">Back to the app</button><Phase4TestScreen phoneModel={phoneModel} networkKind={networkKind} secrets={secrets} http={spikeHttp} /></div> : children}
      {!open && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-24 right-3 z-50 rounded-full bg-(--accent) px-3 py-2 text-xs text-white shadow">Phase 4 test</button>}
    </>
  );
}

const previews = { previewStore, network: networkKind };
// Source links open in the phone's browser (after the same disguised-link check as the computer).
setLinkOpener(openInBrowser);

const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.setAttribute('data-theme', dark.matches ? 'dark' : 'light');
applyTheme();
dark.addEventListener('change', applyTheme);

async function start() {
  const signIn = await createSignIn();
  // Asked once paired; the token goes to the relay with the phone's first message.
  let fcmToken: string | undefined;
  const pair = async (qr: string) => {
    const result = await pairPhone(qr, { auth: signIn, secrets, phoneName: phoneName() });
    if (result.ok) fcmToken = await notificationToken();
    return result;
  };
  const connect = () => connectPhone({ socket: webSocketFactory, auth: signIn, secrets, fcmToken });
  if (localStorage.getItem('alphonso_phone_pairing_v1')) fcmToken = await notificationToken();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <WithPhase4Test>
        <MobileApp signIn={signIn} secrets={secrets} lock={lock} pair={pair} connect={connect} scanQr={scanQr} phoneName={phoneName()} onNotificationAction={onNotificationAction} previews={previews} />
      </WithPhase4Test>
    </React.StrictMode>,
  );
}
void start();
