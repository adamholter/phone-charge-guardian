import { execFile } from 'node:child_process';

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

export async function runRecoveryPlan(plan) {
  const steps = [];

  for (const step of plan) {
    const result = await runStep(step);
    steps.push(result);
  }

  const failures = steps.filter((step) => !step.ok);
  return {
    ok: failures.length === 0,
    steps,
    summary: summarizeSteps(steps)
  };
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

function summarizeSteps(steps) {
  const failed = steps.find((step) => !step.ok);
  if (failed) {
    return `${failed.label} failed: ${failed.stderr || failed.error || 'unknown error'}`;
  }

  const lastAdbList = [...steps].reverse().find((step) => step.args?.[0] === 'devices');
  if (lastAdbList?.stdout) {
    return lastAdbList.stdout.split(/\r?\n/).filter(Boolean).slice(-2).join(' | ');
  }

  return steps.map((step) => step.label).join(' -> ');
}
