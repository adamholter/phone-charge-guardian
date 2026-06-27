import assert from 'node:assert/strict';
import test from 'node:test';

import { createStatusPayload, formatSse } from '../src/status.js';

test('createStatusPayload exposes compact UI-facing monitor state by default', () => {
  const payload = createStatusPayload({
    monitor: {
      status: 'recovering',
      retryCount: 1,
      maxRetries: 2,
      lastKnownPhone: { productName: 'SAMSUNG_Android', serial: 'R5CWA33NC2M' },
      lastRecovery: { summary: 'adb reconnect requested' },
      sample: {
        phoneDevices: [{ productName: 'SAMSUNG_Android' }],
        adbDevices: [{ serial: 'R5CWA33NC2M', isWired: true }],
        errors: []
      },
      now: 1_000
    },
    recoveryInFlight: true,
    eventLog: [{ type: 'disrupted', at: 900 }],
    config: { pollMs: 1_500, allowUsbdKick: false }
  });

  assert.equal(payload.status, 'recovering');
  assert.equal(payload.recoveryInFlight, true);
  assert.equal(payload.phone.serial, 'R5CWA33NC2M');
  assert.equal(payload.config.pollMs, 1_500);
  assert.equal(payload.events.length, 1);
  assert.equal(payload.sample, undefined);
  assert.deepEqual(payload.diagnostics, {
    usbPhoneCount: 1,
    adbWiredCount: 1,
    adbWirelessCount: 0,
    errors: []
  });
});

test('createStatusPayload includes full sample only when details are requested', () => {
  const payload = createStatusPayload({
    monitor: {
      status: 'connected',
      retryCount: 0,
      maxRetries: 2,
      lastKnownPhone: { productName: 'SAMSUNG_Android', serial: 'R5CWA33NC2M' },
      sample: {
        phoneDevices: [{ productName: 'SAMSUNG_Android' }],
        adbDevices: [{ serial: 'R5CWA33NC2M', isWired: true }]
      },
      now: 1_000
    },
    recoveryInFlight: false,
    eventLog: [],
    config: { pollMs: 5_000, allowUsbdKick: false },
    details: true
  });

  assert.equal(payload.sample.adbDevices[0].serial, 'R5CWA33NC2M');
});

test('formatSse serializes named events with JSON payloads', () => {
  assert.equal(
    formatSse('status', { status: 'connected' }),
    'event: status\ndata: {"status":"connected"}\n\n'
  );
});
