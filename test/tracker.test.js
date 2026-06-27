import assert from 'node:assert/strict';
import test from 'node:test';

import { ConnectionTracker } from '../src/tracker.js';

const phone = {
  kind: 'android',
  productName: 'SAMSUNG_Android',
  vendorName: 'SAMSUNG',
  serial: 'R5CWA33NC2M',
  locationId: 17825792
};

test('ConnectionTracker asks for two recoveries after a recent connected phone disappears', () => {
  const tracker = new ConnectionTracker({ maxRetries: 2, missingGraceMs: 10_000 });

  const connected = tracker.observe({ phoneDevices: [phone], adbDevices: [] }, 1_000);
  assert.equal(connected.status, 'connected');
  assert.equal(connected.event?.type, 'connected');

  const firstMiss = tracker.observe({ phoneDevices: [], adbDevices: [] }, 2_000);
  assert.equal(firstMiss.status, 'recovering');
  assert.equal(firstMiss.shouldRecover, true);
  assert.equal(firstMiss.retryCount, 0);
  assert.equal(firstMiss.event?.type, 'disrupted');

  tracker.noteRecoveryAttempt({ ok: false, summary: 'adb reconnect failed' }, 2_100);

  const secondMiss = tracker.observe({ phoneDevices: [], adbDevices: [] }, 3_000);
  assert.equal(secondMiss.status, 'recovering');
  assert.equal(secondMiss.shouldRecover, true);
  assert.equal(secondMiss.retryCount, 1);

  tracker.noteRecoveryAttempt({ ok: false, summary: 'adb usb failed' }, 3_100);

  const finalMiss = tracker.observe({ phoneDevices: [], adbDevices: [] }, 4_000);
  assert.equal(finalMiss.status, 'disconnected');
  assert.equal(finalMiss.shouldRecover, false);
  assert.equal(finalMiss.event?.type, 'assumed_unplugged');
});

test('ConnectionTracker returns to connected state and emits recovered after a retry works', () => {
  const tracker = new ConnectionTracker({ maxRetries: 2, missingGraceMs: 10_000 });

  tracker.observe({ phoneDevices: [phone], adbDevices: [] }, 1_000);
  tracker.observe({ phoneDevices: [], adbDevices: [] }, 2_000);
  tracker.noteRecoveryAttempt({ ok: true, summary: 'adb reconnect requested' }, 2_100);

  const recovered = tracker.observe({ phoneDevices: [phone], adbDevices: [] }, 2_800);
  assert.equal(recovered.status, 'connected');
  assert.equal(recovered.retryCount, 0);
  assert.equal(recovered.event?.type, 'recovered');
});
