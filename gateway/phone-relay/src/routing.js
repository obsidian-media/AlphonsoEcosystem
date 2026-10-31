// The Obsidian Media phone relay: forwards sealed frames between a phone and the computer
// it is paired with, under one signed-in account. It never opens a frame (it can't: they
// are sealed between the two devices) and keeps no content.
//
// A connection is { send(obj), close(code) }. Close codes: 4401 not signed in, 4403 this
// device isn't yours or isn't paired.
//
// Phase 1 runs as ONE relay instance: connections live in this process's memory, so a
// phone and its computer must reach the same instance. Spreading over several instances
// needs a shared message bus (see README).

const BAD_TOKEN = 4401;
const NOT_YOURS = 4403;

export function createRelay({ verifyToken, store, limiter, now = () => Date.now(), push }) {
  const live = new Map(); // deviceId → connection
  const who = new WeakMap(); // connection → { uid, deviceId, role }

  async function pairedPeer(from, toId) {
    // Ann's phone may talk to Ann's computer it is paired with, and back; nothing else.
    if (from.role === 'phone') {
      const p = await store.getPairing(from.deviceId);
      return !!p && p.uid === from.uid && p.computerId === toId;
    }
    const p = await store.getPairing(toId);
    return !!p && p.uid === from.uid && p.computerId === from.deviceId;
  }

  return {
    async hello(conn, msg) {
      let uid;
      try { uid = await verifyToken(String(msg?.idToken || '')); } catch { conn.close(BAD_TOKEN); return; }
      const deviceId = String(msg?.deviceId || '');
      const role = msg?.role === 'phone' ? 'phone' : msg?.role === 'computer' ? 'computer' : null;
      if (!deviceId || !role) { conn.close(NOT_YOURS); return; }
      const existing = await store.getDevice(deviceId);
      if (existing && (existing.uid !== uid || existing.role !== role)) { conn.close(NOT_YOURS); return; }
      if (role === 'phone') {
        const p = await store.getPairing(deviceId);
        if (!p || p.uid !== uid) { conn.close(NOT_YOURS); return; }
      }
      const record = { uid, role, lastSeenMs: null };
      if (role === 'phone' && typeof msg.fcmToken === 'string' && msg.fcmToken) record.fcmToken = msg.fcmToken;
      await store.putDevice(deviceId, record);
      const old = live.get(deviceId);
      if (old && old !== conn) old.close(NOT_YOURS);
      live.set(deviceId, conn);
      who.set(conn, { uid, deviceId, role });
      conn.send({ type: 'ready' });
    },

    async message(conn, msg) {
      const from = who.get(conn);
      if (!from) { conn.close(BAD_TOKEN); return; }
      if (msg?.type !== 'to' && msg?.type !== 'push') { conn.send({ type: 'error', reason: 'unknown_type' }); return; }
      const body = msg.type === 'to' ? msg.frame : msg.sealed;
      if (typeof body !== 'string' || typeof msg.deviceId !== 'string') { conn.send({ type: 'error', reason: 'bad_message' }); return; }
      const refused = limiter.check(from.deviceId, body.length, now());
      if (refused) { conn.send({ type: 'error', reason: refused }); return; }
      if (!(await pairedPeer(from, msg.deviceId))) { conn.send({ type: 'error', reason: 'not_paired' }); return; }
      if (msg.type === 'push') {
        if (from.role !== 'computer') { conn.send({ type: 'error', reason: 'not_paired' }); return; }
        const phone = await store.getDevice(msg.deviceId);
        if (phone?.fcmToken && push) await push(phone.fcmToken, body);
        return;
      }
      const target = live.get(msg.deviceId);
      if (!target) {
        const rec = await store.getDevice(msg.deviceId);
        conn.send({ type: 'offline', deviceId: msg.deviceId, sinceMs: rec?.lastSeenMs ?? null });
        return;
      }
      target.send({ type: 'from', deviceId: from.deviceId, frame: body });
    },

    async closed(conn) {
      const from = who.get(conn);
      if (!from) return;
      who.delete(conn);
      if (live.get(from.deviceId) === conn) live.delete(from.deviceId);
      await store.putDevice(from.deviceId, { lastSeenMs: now() });
    },

    /** Pair a phone with a computer the same account signed in on. */
    async pair({ idToken, computerId, phoneDeviceId }) {
      const uid = await verifyToken(String(idToken || ''));
      const pc = await store.getDevice(String(computerId || ''));
      if (!pc || pc.uid !== uid || pc.role !== 'computer') throw new Error('That computer is not yours, or has not connected yet.');
      const phone = await store.getDevice(String(phoneDeviceId || ''));
      if (phone && (phone.uid !== uid || phone.role !== 'phone')) throw new Error('That phone is not yours.');
      await store.putPairing(phoneDeviceId, { uid, computerId, createdAtMs: now() });
    },

    /** Unpair a phone: it can't send another frame, and is dropped at once. */
    async removePair({ idToken, phoneDeviceId }) {
      const uid = await verifyToken(String(idToken || ''));
      const p = await store.getPairing(String(phoneDeviceId || ''));
      if (!p || p.uid !== uid) throw new Error('That phone is not paired with your computers.');
      await store.deletePairing(phoneDeviceId);
      const conn = live.get(phoneDeviceId);
      if (conn) { live.delete(phoneDeviceId); who.delete(conn); conn.close(NOT_YOURS); }
      limiter.forget?.(phoneDeviceId);
    },
  };
}
