export function createStatusPayload({ monitor, recoveryInFlight, eventLog, config, details = false }) {
  const sample = monitor.sample || {};
  const adbDevices = sample.adbDevices || [];
  const payload = {
    status: monitor.status,
    retryCount: monitor.retryCount,
    maxRetries: monitor.maxRetries,
    recoveryInFlight,
    phone: monitor.lastKnownPhone,
    lastSeenAt: monitor.lastSeenAt,
    lastChangedAt: monitor.lastChangedAt,
    lastRecovery: monitor.lastRecovery,
    diagnostics: {
      usbPhoneCount: sample.phoneDevices?.length || 0,
      adbWiredCount: adbDevices.filter((device) => device.isWired).length,
      adbWirelessCount: adbDevices.filter((device) => !device.isWired).length,
      errors: sample.errors || []
    },
    events: details ? eventLog : eventLog.slice(0, 8),
    config,
    now: monitor.now
  };

  if (details) {
    payload.sample = monitor.sample;
  }

  return payload;
}

export function formatSse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
