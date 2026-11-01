// Firebase for the relay: checking sign-in tokens, the Firestore records, and sending a
// notification. Uses the service's own Google credentials (the VM's service account), never a key file.
// Firestore holds devices/{deviceId} (uid, role, lastSeenMs, fcmToken) and
// pairings/{phoneDeviceId} (uid, computerId, createdAtMs): no content.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { pushMessage } from './pushMessage.js';

export async function initFirebase() {
  const app = initializeApp({ credential: applicationDefault() });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const messaging = getMessaging(app);
  const devices = db.collection('devices');
  const pairings = db.collection('pairings');
  const store = {
    async getDevice(id) { const d = await devices.doc(id).get(); return d.exists ? d.data() : null; },
    async putDevice(id, record) { await devices.doc(id).set(record, { merge: true }); },
    async getPairing(id) { const d = await pairings.doc(id).get(); return d.exists ? d.data() : null; },
    async putPairing(id, record) { await pairings.doc(id).set(record); },
    async deletePairing(id) { await pairings.doc(id).delete(); },
  };
  return {
    store,
    verifyToken: async (idToken) => (await auth.verifyIdToken(idToken, true)).uid,
    // A data-only message: the app's notification extension opens it with its own key.
    push: async (token, sealed) => { await messaging.send(pushMessage(token, sealed)); },
  };
}
