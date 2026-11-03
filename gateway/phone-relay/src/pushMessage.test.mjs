import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushMessage } from './pushMessage.js';

test('a push carries only the sealed notice, with a generic text for Apple to show until it is opened', () => {
  const m = pushMessage('tok', 'SEALED');
  assert.equal(m.token, 'tok');
  assert.deepEqual(m.data, { sealed: 'SEALED' });
  assert.equal(m.apns.payload.aps['mutable-content'], 1);
  assert.deepEqual(m.apns.payload.aps.alert, { title: 'Alphonso', body: 'New activity' });
  assert.equal(JSON.stringify(m).includes('notification'), false);
});

test('Android gets it at high priority, so it arrives while the phone sleeps', () => {
  assert.equal(pushMessage('tok', 'S').android.priority, 'high');
});
