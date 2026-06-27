import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getUsbProbe, shouldRunUsbProbe } from './platform.js';
import { buildRecoveryPlan, runRecoveryPlan } from './recovery.js';
import { createStatusPayload, formatSse } from './status.js';
import { ConnectionTracker } from './tracker.js';
import {
  classifyPhoneDevices,
  parseAdbDevices,
  parseIoregUsbDevices,
  parseLsusbDevices,
  parseWindowsPnpUsbDevices
} from './usb.js';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');

const config = {
  host: process.env.PHONE_CHARGE_GUARDIAN_HOST || '127.0.0.1',
  port: Number(process.env.PHONE_CHARGE_GUARDIAN_PORT || 3769),
  pollMs: Number(process.env.PHONE_CHARGE_GUARDIAN_POLL_MS || 5_000),
  usbProbeEvery: Number(process.env.PHONE_CHARGE_GUARDIAN_USB_PROBE_EVERY || 3),
  missingGraceMs: Number(process.env.PHONE_CHARGE_GUARDIAN_GRACE_MS || 20_000),
  maxRetries: Number(process.env.PHONE_CHARGE_GUARDIAN_MAX_RETRIES || 2),
  adbPath: process.env.PHONE_CHARGE_GUARDIAN_ADB || 'adb',
  platform: process.env.PHONE_CHARGE_GUARDIAN_PLATFORM || process.platform,
  allowUsbdKick: process.env.PHONE_CHARGE_GUARDIAN_ALLOW_USBD_KICK === '1'
};
const usbProbe = getUsbProbe(config.platform);

const tracker = new ConnectionTracker({
  maxRetries: config.maxRetries,
  missingGraceMs: config.missingGraceMs
});

const clients = new Set();
const eventLog = [];
let lastMonitor = tracker.snapshot();
let recoveryInFlight = false;
let pollInFlight = false;
let pollTimer = null;
let pollCount = 0;

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${config.host}:${config.port}`);
    if (requestUrl.pathname === '/events') {
      return handleEvents(response);
    }
    if (requestUrl.pathname === '/api/status') {
      return sendJson(response, statusPayload(requestUrl.searchParams.get('details') === '1'));
    }
    if (requestUrl.pathname === '/api/recover' && request.method === 'POST') {
      queueRecovery('manual');
      return sendJson(response, { ok: true, status: 'queued' }, 202);
    }
    if (requestUrl.pathname === '/api/recover') {
      return sendJson(response, { ok: false, error: 'method not allowed' }, 405);
    }

    return serveStatic(requestUrl, response);
  } catch (error) {
    emit({
      type: 'error',
      at: Date.now(),
      message: error.message
    });
    return sendJson(response, { ok: false, error: error.message }, 500);
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Phone Charge Guardian listening at http://${config.host}:${config.port}`);
});

schedulePoll(0);

async function poll() {
  if (pollInFlight) {
    return;
  }

  pollInFlight = true;
  try {
    const sample = await sampleConnection();
    lastMonitor = tracker.observe(sample, Date.now());
    if (lastMonitor.event) {
      emit(lastMonitor.event);
      broadcastStatus('status');
    }
    if (lastMonitor.shouldRecover && !recoveryInFlight) {
      queueRecovery('auto');
    }
  } catch (error) {
    emit({
      type: 'error',
      at: Date.now(),
      message: error.message
    });
  } finally {
    pollInFlight = false;
    schedulePoll(config.pollMs);
  }
}

async function sampleConnection() {
  pollCount += 1;
  const errors = [];
  const adbResult = await Promise.resolve(runCommand(config.adbPath, ['devices', '-l'], { timeoutMs: 3_000 }))
    .then((result) => ({ status: 'fulfilled', value: result }))
    .catch((reason) => ({ status: 'rejected', reason }));
  const adbDevices = adbResult.status === 'fulfilled'
    ? parseAdbDevices(adbResult.value.stdout)
    : [];
  if (adbResult.status === 'rejected') {
    errors.push(`adb: ${adbResult.reason.message}`);
  }

  const hasAdbDevice = adbDevices.some((device) => device.isWired && device.state === 'device');
  const runUsbProbe = Boolean(usbProbe) && shouldRunUsbProbe({
    pollCount,
    usbProbeEvery: config.usbProbeEvery,
    hasKnownPhone: Boolean(lastMonitor.lastKnownPhone),
    hasAdbDevice
  });

  let usbDevices = runUsbProbe ? [] : (lastMonitor.sample?.usbDevices || []);
  if (runUsbProbe) {
    const usbResult = await Promise.resolve(runCommand(usbProbe.command, usbProbe.args, { timeoutMs: 3_000 }))
      .then((result) => ({ status: 'fulfilled', value: result }))
      .catch((reason) => ({ status: 'rejected', reason }));
    if (usbResult.status === 'fulfilled') {
      usbDevices = parseUsbProbe(usbProbe.parser, usbResult.value.stdout);
    } else {
      errors.push(`usb: ${usbResult.reason.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    sampledAt: Date.now(),
    platform: config.platform,
    usbProbeSkipped: !runUsbProbe,
    usbDevices,
    phoneDevices: classifyPhoneDevices(usbDevices),
    adbDevices,
    errors
  };
}

function parseUsbProbe(parser, output) {
  if (parser === 'ioreg') {
    return parseIoregUsbDevices(output);
  }
  if (parser === 'lsusb') {
    return parseLsusbDevices(output);
  }
  if (parser === 'windows-pnp') {
    return parseWindowsPnpUsbDevices(output);
  }
  return [];
}

function schedulePoll(delay) {
  if (pollTimer) {
    clearTimeout(pollTimer);
  }
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void poll();
  }, Math.max(0, delay));
  pollTimer.unref?.();
}

function queueRecovery(reason) {
  if (recoveryInFlight) {
    return;
  }
  void recover(reason);
}

async function recover(reason) {
  recoveryInFlight = true;
  const attempt = tracker.retryCount;
  const wiredSerial = findWiredSerial();
  const plan = buildRecoveryPlan({
    adbPath: config.adbPath,
    attempt,
    wiredSerial,
    allowUsbdKick: config.allowUsbdKick
  });

  emit({
    type: 'recovery_started',
    at: Date.now(),
    reason,
    attempt: attempt + 1,
    steps: plan.map((step) => step.label)
  });
  broadcastStatus('status');

  const result = await runRecoveryPlan(plan);
  tracker.noteRecoveryAttempt(result, Date.now());
  lastMonitor = tracker.snapshot({ sample: lastMonitor.sample });

  emit({
    type: 'recovery_finished',
    at: Date.now(),
    ok: result.ok,
    attempt: tracker.retryCount,
    summary: result.summary,
    steps: result.steps.map((step) => ({
      label: step.label,
      ok: step.ok,
      code: step.code,
      error: step.stderr || step.error
    }))
  });

  recoveryInFlight = false;
  broadcastStatus('status');
  schedulePoll(500);
}

function findWiredSerial() {
  const wiredAdb = lastMonitor.sample?.adbDevices?.find((device) => device.isWired && device.state === 'device');
  return wiredAdb?.serial || lastMonitor.lastKnownPhone?.serial || null;
}

function emit(event) {
  eventLog.unshift(event);
  eventLog.splice(80);
  broadcast(event.type, event);
}

function broadcastStatus(eventName) {
  broadcast(eventName, statusPayload());
}

function statusPayload(details = false) {
  return createStatusPayload({
    monitor: lastMonitor,
    recoveryInFlight,
    eventLog,
    config: {
      pollMs: config.pollMs,
      usbProbeEvery: config.usbProbeEvery,
      missingGraceMs: config.missingGraceMs,
      maxRetries: config.maxRetries,
      platform: config.platform,
      allowUsbdKick: config.allowUsbdKick
    },
    details
  });
}

function handleEvents(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.write(formatSse('status', statusPayload()));
  clients.add(response);
  response.on('close', () => clients.delete(response));
}

function broadcast(event, payload) {
  const message = formatSse(event, payload);
  for (const client of clients) {
    client.write(message);
  }
}

function sendJson(response, body, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function serveStatic(url, response) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const normalized = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error('not a file');
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

function runCommand(command, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
