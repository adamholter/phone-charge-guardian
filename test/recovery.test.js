import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecoveryPlan } from '../src/recovery.js';

test('buildRecoveryPlan uses conservative adb recovery and escalates to server restart', () => {
  const first = buildRecoveryPlan({
    adbPath: '/opt/homebrew/bin/adb',
    attempt: 0,
    wiredSerial: 'R5CWA33NC2M',
    allowUsbdKick: false
  });
  const second = buildRecoveryPlan({
    adbPath: '/opt/homebrew/bin/adb',
    attempt: 1,
    wiredSerial: 'R5CWA33NC2M',
    allowUsbdKick: false
  });

  assert.deepEqual(first.map((step) => step.args), [
    ['start-server'],
    ['reconnect', 'offline'],
    ['devices', '-l']
  ]);
  assert.deepEqual(second.map((step) => step.args), [
    ['kill-server'],
    ['start-server'],
    ['devices', '-l']
  ]);
});

test('buildRecoveryPlan keeps macOS usbd kick opt-in', () => {
  const plan = buildRecoveryPlan({
    adbPath: '/opt/homebrew/bin/adb',
    attempt: 2,
    wiredSerial: null,
    allowUsbdKick: true
  });

  assert.equal(plan.some((step) => step.command === '/bin/launchctl'), true);
});
