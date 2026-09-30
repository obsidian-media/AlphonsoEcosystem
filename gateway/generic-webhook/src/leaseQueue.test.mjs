// Run with: node --test gateway/generic-webhook/src/leaseQueue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaseQueue, clientKeyFromRequest } from './leaseQueue.js';

test('plain drain removes items (legacy clients)', () => {
  const q = createLeaseQueue();
  q.enqueue({ a: 1 });
  assert.equal(q.drain(10).length, 1);
  assert.equal(q.size(), 0);
});

test('leased items are hidden until the lease expires, then redelivered', () => {
  const q = createLeaseQueue({ leaseMs: 1000 });
  q.enqueue({ a: 1 });
  const first = q.drain(10, { lease: true, now: 0 });
  assert.equal(first.length, 1);
  assert.equal(q.drain(10, { lease: true, now: 500 }).length, 0);
  const again = q.drain(10, { lease: true, now: 1500 });
  assert.equal(again[0].deliveryId, first[0].deliveryId);
});

test('ack removes leased items for good', () => {
  const q = createLeaseQueue({ leaseMs: 1000 });
  q.enqueue({ a: 1 });
  const [item] = q.drain(10, { lease: true, now: 0 });
  assert.equal(q.ack([item.deliveryId]), 1);
  assert.equal(q.drain(10, { lease: true, now: 5000 }).length, 0);
});

test('rate-limit key uses the proxy-appended (last) X-Forwarded-For hop', () => {
  const req = { headers: { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, socket: {} };
  assert.equal(clientKeyFromRequest(req), '9.9.9.9');
});
