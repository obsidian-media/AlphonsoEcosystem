// The phone app's start: the desktop's styles and phone screens, with this phone's native
// parts. The theme follows the phone's light / dark setting.
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/styles/tokens.css';
import '@fontsource-variable/inter';
import '../../src/index.css';
import { MobileApp } from '../../src/mobile/MobileApp';
import { connectPhone, pairPhone } from '../../src/mobile/phoneSession';
import { webSocketFactory } from '../../src/services/phone/phoneLink';
import { setLinkOpener } from '../../src/services/browserAutomationService';
import { createSignIn, lock, networkKind, openInBrowser, notificationToken, onNotificationAction, phoneName, previewStore, scanQr, secrets } from './native';

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
      <MobileApp signIn={signIn} secrets={secrets} lock={lock} pair={pair} connect={connect} scanQr={scanQr} phoneName={phoneName()} onNotificationAction={onNotificationAction} previews={previews} />
    </React.StrictMode>,
  );
}
void start();
