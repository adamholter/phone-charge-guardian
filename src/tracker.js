export class ConnectionTracker {
  constructor({ maxRetries = 2, missingGraceMs = 8_000 } = {}) {
    this.maxRetries = maxRetries;
    this.missingGraceMs = missingGraceMs;
    this.status = 'unknown';
    this.retryCount = 0;
    this.lastSeenAt = null;
    this.lastChangedAt = null;
    this.lastKnownPhone = null;
    this.lastRecovery = null;
  }

  observe(sample, now = Date.now()) {
    const phone = chooseObservedPhone(sample);
    const previousStatus = this.status;
    let event = null;
    let shouldRecover = false;

    if (phone) {
      const wasRecovering = previousStatus === 'recovering' || this.retryCount > 0;
      this.status = 'connected';
      this.retryCount = 0;
      this.lastSeenAt = now;
      this.lastKnownPhone = phone;

      if (previousStatus !== 'connected') {
        this.lastChangedAt = now;
        event = {
          type: wasRecovering ? 'recovered' : 'connected',
          at: now,
          phone
        };
      }

      return this.snapshot({ event, shouldRecover, sample, now });
    }

    const recentlySeen = this.lastSeenAt !== null && now - this.lastSeenAt <= this.missingGraceMs;
    if (recentlySeen && this.retryCount < this.maxRetries) {
      this.status = 'recovering';
      shouldRecover = true;
      if (previousStatus !== 'recovering') {
        this.lastChangedAt = now;
        event = {
          type: 'disrupted',
          at: now,
          phone: this.lastKnownPhone,
          retryCount: this.retryCount
        };
      }
    } else {
      const eventType = previousStatus === 'recovering' ? 'assumed_unplugged' : 'disconnected';
      this.status = 'disconnected';
      if (previousStatus !== 'disconnected') {
        this.lastChangedAt = now;
        event = {
          type: eventType,
          at: now,
          phone: this.lastKnownPhone,
          retryCount: this.retryCount
        };
      }
    }

    return this.snapshot({ event, shouldRecover, sample, now });
  }

  noteRecoveryAttempt(result, now = Date.now()) {
    this.retryCount += 1;
    this.lastRecovery = {
      at: now,
      attempt: this.retryCount,
      ok: Boolean(result.ok),
      summary: result.summary || ''
    };
    return this.lastRecovery;
  }

  snapshot({ event = null, shouldRecover = false, sample = null, now = Date.now() } = {}) {
    return {
      status: this.status,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      lastSeenAt: this.lastSeenAt,
      lastChangedAt: this.lastChangedAt,
      lastKnownPhone: this.lastKnownPhone,
      lastRecovery: this.lastRecovery,
      sample,
      event,
      shouldRecover,
      now
    };
  }
}

function chooseObservedPhone(sample) {
  const phone = sample?.phoneDevices?.[0];
  if (phone) {
    return phone;
  }

  const wiredAdb = sample?.adbDevices?.find((device) => device.isWired && device.state === 'device');
  if (!wiredAdb) {
    return null;
  }

  return {
    kind: 'android',
    productName: wiredAdb.details.model || 'Android over USB',
    vendorName: wiredAdb.details.product || null,
    serial: wiredAdb.serial,
    locationId: null,
    confidence: 'medium'
  };
}
