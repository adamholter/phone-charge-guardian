import { execFile } from 'node:child_process';

import { parseAdbDevices } from './usb.js';

export function buildRecoveryPlan({
  adbPath = 'adb',
  attempt = 0,
  wiredSerial = null,
  allowUsbdKick = false
} = {}) {
  const plan = [];
  const adb = (...args) => plan.push({
    command: adbPath,
    args,
    label: `adb ${args.join(' ')}`,
    timeoutMs: 5_000
  });
  void wiredSerial;

  if (attempt <= 0) {
    adb('start-server');
    adb('reconnect', 'offline');
    adb('devices', '-l');
    return plan;
  }

  if (attempt === 1) {
    adb('kill-server');
    adb('start-server');
    adb('devices', '-l');
    return plan;
  }

  adb('kill-server');
  adb('start-server');
  adb('reconnect');
  adb('reconnect', 'offline');
  adb('devices', '-l');

  if (allowUsbdKick) {
    plan.push({
      command: '/bin/launchctl',
      args: ['kickstart', '-k', 'system/com.apple.usbd'],
      label: 'kickstart macOS usbd',
      timeoutMs: 5_000
    });
  }

  return plan;
}

export async function runRecoveryPlan(plan, options = {}) {
  const steps = [];

  for (const step of plan) {
    const result = await runStep(step);
    steps.push(result);
  }

  return evaluateRecoverySteps(steps, options);
}

export function evaluateRecoverySteps(steps, { wiredSerial = null } = {}) {
  const failed = steps.find((step) => !step.ok);
  if (failed) {
    return {
      ok: false,
      steps,
      summary: `${failed.label} failed: ${failed.stderr || failed.error || 'unknown error'}`
    };
  }

  const lastAdbList = findLastAdbDeviceList(steps);
  if (!lastAdbList) {
    return {
      ok: true,
      steps,
      summary: steps.map((step) => step.label).join(' -> ')
    };
  }

  if (!hasRecoveredWiredAdb(lastAdbList.stdout, wiredSerial)) {
    const target = wiredSerial ? ` ${wiredSerial}` : '';
    return {
      ok: false,
      steps,
      summary: `No wired ADB device${target} found after recovery`
    };
  }

  return {
    ok: true,
    steps,
    summary: summarizeAdbDevices(lastAdbList.stdout)
  };
}

export function hasRecoveredWiredAdb(output, wiredSerial = null) {
  return parseAdbDevices(output).some((device) => {
    if (!device.isWired || device.state !== 'device') {
      return false;
    }
    return wiredSerial ? device.serial === wiredSerial : true;
  });
}

function runStep(step) {
  return new Promise((resolve) => {
    const child = execFile(step.command, step.args, {
      timeout: step.timeoutMs || 5_000,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({
        ...step,
        ok: !error,
        code: error?.code ?? 0,
        signal: error?.signal ?? null,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: error?.message || null
      });
    });

    child.on('error', (error) => {
      resolve({
        ...step,
        ok: false,
        code: error.code || 1,
        signal: null,
        stdout: '',
        stderr: '',
        error: error.message
      });
    });
  });
}

function findLastAdbDeviceList(steps) {
  return [...steps].reverse().find((step) => step.args?.[0] === 'devices');
}

function summarizeAdbDevices(output) {
  return String(output || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' | ');
}
