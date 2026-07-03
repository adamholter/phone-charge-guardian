import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecoveryPlan, evaluateRecoverySteps, hasRecoveredWiredAdb } from '../src/recovery.js';

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

test('hasRecoveredWiredAdb rejects empty and wireless-only adb device lists', () => {
  assert.equal(hasRecoveredWiredAdb('List of devices attached\n', 'R5CWA33NC2M'), false);
  assert.equal(hasRecoveredWiredAdb(`List of devices attached
192.168.1.196:5555     device product:r0qsqw model:SM_S901U device:r0q transport_id:4
`, 'R5CWA33NC2M'), false);
  assert.equal(hasRecoveredWiredAdb(`List of devices attached
R5CWA33NC2M            device usb:1-1 product:r0qsqw model:SM_S901U device:r0q transport_id:1
`, 'R5CWA33NC2M'), true);
});

test('evaluateRecoverySteps marks command success as failed when no wired phone returns', () => {
  const result = evaluateRecoverySteps([
    { ok: true, label: 'adb start-server', args: ['start-server'], stdout: '' },
    { ok: true, label: 'adb devices -l', args: ['devices', '-l'], stdout: 'List of devices attached' }
  ], { wiredSerial: 'R5CWA33NC2M' });

  assert.equal(result.ok, false);
  assert.match(result.summary, /No wired ADB device/);
});
