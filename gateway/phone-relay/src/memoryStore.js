// The relay's records kept in memory: for tests and local runs. firestoreStore.js has the
// same shape. Only who owns which device and which phone is paired to which computer;
// never any content.
export function createMemoryStore() {
  const devices = new Map(); // deviceId → { uid, role, lastSeenMs, fcmToken }
  const pairings = new Map(); // phoneDeviceId → { uid, computerId, createdAtMs }
  return {
    async getDevice(id) { return devices.get(id) || null; },
    async putDevice(id, record) { devices.set(id, { ...(devices.get(id) || {}), ...record }); },
    async getPairing(phoneId) { return pairings.get(phoneId) || null; },
    async putPairing(phoneId, record) { pairings.set(phoneId, record); },
    async deletePairing(phoneId) { pairings.delete(phoneId); },
  };
}
