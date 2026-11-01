// The phone app's native code (Swift, Java) and the shared code must agree on names nothing
// else checks across the language boundary: secure-storage key names, the plugin and its
// methods, the notification event and buttons. Read from the sources, like
// companionIntegration.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COMPUTER_KEY_NAME, PRIVATE_KEY_NAME } from '../../mobile/phoneSession';

const root = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const native = read('mobile/src/native.ts');
const swiftKeys = read('mobile/ios/App/Shared/PhoneKeychain.swift');
const swiftPlugin = read('mobile/ios/App/App/AlphonsoPhonePlugin.swift');
const swiftNotice = read('mobile/ios/App/NotificationService/NotificationService.swift');
const javaKeys = read('mobile/android/app/src/main/java/com/alphonso/companion/PhoneSecrets.java');
const javaPlugin = read('mobile/android/app/src/main/java/com/alphonso/companion/AlphonsoPhonePlugin.java');
const javaPush = read('mobile/android/app/src/main/java/com/alphonso/companion/PushService.java');

const methods = [...native.matchAll(/^\s{2}(\w+)\(o?[:)]/gm)].map((m) => m[1]).filter((m) => m !== 'addListener');

describe("the phone app's native code", () => {
  it('reads the keys under the names the shared code saves them', () => {
    for (const src of [swiftKeys, javaKeys]) {
      expect(src).toContain(`"${PRIVATE_KEY_NAME}"`);
      expect(src).toContain(`"${COMPUTER_KEY_NAME}"`);
    }
  });

  it('has every plugin method the shared code calls, under one plugin name', () => {
    expect(methods.sort()).toEqual(['confirm', 'getSecret', 'pushToken', 'requestNotifications', 'setSecret', 'takePendingActions']);
    expect(native).toContain("registerPlugin<AlphonsoPhonePlugin>('AlphonsoPhone')");
    expect(swiftPlugin).toContain('jsName = "AlphonsoPhone"');
    expect(javaPlugin).toContain('name = "AlphonsoPhone"');
    for (const m of methods) {
      expect(swiftPlugin).toContain(`CAPPluginMethod(name: "${m}"`);
      expect(javaPlugin).toMatch(new RegExp(`@PluginMethod\\s+public void ${m}\\(`));
    }
  });

  it('sends notification buttons as the event the shared code listens to, with its three actions', () => {
    expect(native).toContain("'notificationAction'");
    for (const src of [swiftPlugin, javaPlugin]) {
      expect(src).toContain('"notificationAction"');
      for (const a of ['approve', 'reject', 'open']) expect(src).toContain(`"${a}"`);
    }
  });

  it('opens a notice only when the computer sealed one, and offers Approve only when the notice does', () => {
    expect(swiftNotice).toContain('message["kind"] as? String == "notice"');
    expect(swiftNotice).toContain('notice.actions.contains("approve")');
    expect(javaPush).toContain('"notice".equals(message.optString("kind"))');
    expect(javaPush).toContain('"approve".equals(a)');
  });

  // Email sign-in (owner, 2026-11-01): the emailed link opens the app on the Firebase project's
  // own link domain, <project>.firebaseapp.com, taken from the project at build time, never
  // written into the app.
  it('claims the Firebase link domain on both phones, from the build, not a fixed name', () => {
    const entitlements = read('mobile/ios/App/App/App.entitlements');
    expect(entitlements).toContain('<string>applinks:$(PHONE_LINK_HOST)</string>');
    expect(read('mobile/scripts/firebase-config.mjs')).toContain('PHONE_LINK_HOST = ${linkProject}.firebaseapp.com');
    const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/<intent-filter android:autoVerify="true">[\s\S]*android:host="\$\{phoneLinkHost\}"/);
    expect(read('mobile/android/app/build.gradle')).toContain('phoneLinkHost');
    for (const src of [entitlements, manifest]) expect(src).not.toContain('firebaseapp.com');
  });

  it('signs the Android release build only with a key given at build time', () => {
    const gradle = read('mobile/android/app/build.gradle');
    for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD']) expect(gradle).toContain(`System.getenv('${name}')`);
    expect(gradle).not.toMatch(/storePassword\s+['"]/);
  });

  it('keeps the iPhone minimum at iOS 16.4, which Tailwind v4 needs', () => {
    expect(read('mobile/ios/App/project.yml')).toContain('iOS: "16.4"');
    expect(read('mobile/vite.config.mjs')).toContain("target: 'safari16.4'");
  });
});
