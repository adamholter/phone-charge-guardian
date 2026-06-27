import assert from 'node:assert/strict';
import test from 'node:test';

import { getUsbProbe, shouldRunUsbProbe } from '../src/platform.js';

test('getUsbProbe selects a platform USB command and parser', () => {
  assert.deepEqual(getUsbProbe('darwin'), {
    command: '/usr/sbin/ioreg',
    args: ['-p', 'IOUSB', '-l', '-w', '0'],
    parser: 'ioreg'
  });
  assert.equal(getUsbProbe('linux').parser, 'lsusb');
  assert.equal(getUsbProbe('win32').parser, 'windows-pnp');
});

test('shouldRunUsbProbe reduces expensive platform probes when adb is already enough', () => {
  assert.equal(shouldRunUsbProbe({ pollCount: 1, usbProbeEvery: 3, hasKnownPhone: true, hasAdbDevice: true }), false);
  assert.equal(shouldRunUsbProbe({ pollCount: 3, usbProbeEvery: 3, hasKnownPhone: true, hasAdbDevice: true }), true);
  assert.equal(shouldRunUsbProbe({ pollCount: 1, usbProbeEvery: 3, hasKnownPhone: false, hasAdbDevice: false }), true);
});
