const elements = {
  app: document.querySelector('#app'),
  statusText: document.querySelector('#statusText'),
  summary: document.querySelector('#summary'),
  deviceText: document.querySelector('#deviceText'),
  lastSeenText: document.querySelector('#lastSeenText'),
  retryText: document.querySelector('#retryText'),
  recoverButton: document.querySelector('#recoverButton'),
  logsDetails: document.querySelector('#logsDetails'),
  logCount: document.querySelector('#logCount'),
  usbCount: document.querySelector('#usbCount'),
  adbWired: document.querySelector('#adbWired'),
  adbWireless: document.querySelector('#adbWireless'),
  pollText: document.querySelector('#pollText'),
  platformText: document.querySelector('#platformText'),
  lastRecoveryText: document.querySelector('#lastRecoveryText'),
  eventList: document.querySelector('#eventList')
};

const eventLabels = {
  connected: 'Connected',
  disrupted: 'Disrupted',
  recovery_started: 'Recovery started',
  recovery_finished: 'Recovery finished',
  recovered: 'Recovered',
  assumed_unplugged: 'Assumed unplugged',
  disconnected: 'Disconnected',
  error: 'Error'
};

let latestStatus = null;

elements.recoverButton.addEventListener('click', async () => {
  elements.recoverButton.disabled = true;
  try {
    await fetch('/api/recover', { method: 'POST' });
    await refreshStatus(elements.logsDetails.open);
  } finally {
    window.setTimeout(() => {
      elements.recoverButton.disabled = false;
    }, 600);
  }
});

elements.logsDetails.addEventListener('toggle', () => {
  if (elements.logsDetails.open) {
    void refreshStatus(true);
  }
});

await refreshStatus(false);
connectEvents();

function connectEvents() {
  const source = new EventSource('/events');

  source.addEventListener('status', (event) => {
    renderStatus(JSON.parse(event.data));
  });

  for (const type of Object.keys(eventLabels)) {
    source.addEventListener(type, (event) => {
      flash();
      renderEvent(JSON.parse(event.data), true);
      void refreshStatus(elements.logsDetails.open);
    });
  }
}

async function refreshStatus(details) {
  const response = await fetch(`/api/status${details ? '?details=1' : ''}`);
  renderStatus(await response.json());
}

function renderStatus(status) {
  latestStatus = status;
  const current = status.status || 'unknown';
  const phone = status.phone || {};
  const diagnostics = status.diagnostics || {};

  elements.app.dataset.status = current;
  elements.statusText.textContent = titleCase(current);
  elements.summary.textContent = summaryFor(status);
  elements.deviceText.textContent = phone.serial
    ? `${phone.productName || 'Phone'} / ${phone.serial}`
    : 'No wired phone detected';
  elements.lastSeenText.textContent = status.lastSeenAt ? relativeTime(status.lastSeenAt) : 'Never';
  elements.retryText.textContent = `${status.retryCount || 0} / ${status.maxRetries || 2}`;
  elements.logCount.textContent = `${status.events?.length || 0} events`;
  elements.usbCount.textContent = String(diagnostics.usbPhoneCount || 0);
  elements.adbWired.textContent = String(diagnostics.adbWiredCount || 0);
  elements.adbWireless.textContent = String(diagnostics.adbWirelessCount || 0);
  elements.pollText.textContent = status.config?.pollMs ? `${status.config.pollMs} ms` : 'Unknown';
  elements.platformText.textContent = status.config?.platform || 'Unknown';
  elements.lastRecoveryText.textContent = status.lastRecovery?.summary || 'None';

  if (elements.logsDetails.open) {
    renderEvents(status.events || []);
  }
}

function renderEvents(events) {
  elements.eventList.innerHTML = '';
  for (const event of events.slice(0, 30)) {
    renderEvent(event, false);
  }
}

function renderEvent(event, prepend) {
  if (!event?.type) {
    return;
  }
  if (!elements.logsDetails.open && !prepend) {
    return;
  }

  const item = document.createElement('li');
  item.innerHTML = `
    <span class="event-title">${escapeHtml(eventLabels[event.type] || titleCase(event.type))}</span>
    <span class="event-detail">${escapeHtml(event.summary || event.message || event.phone?.serial || '')}</span>
    <time class="event-time">${escapeHtml(relativeTime(event.at))}</time>
  `;

  if (prepend) {
    elements.eventList.prepend(item);
  } else {
    elements.eventList.append(item);
  }
}

function summaryFor(status) {
  if (status.recoveryInFlight) {
    return 'Recovery is running.';
  }
  if (status.status === 'connected') {
    return 'The wired phone connection is visible.';
  }
  if (status.status === 'recovering') {
    return 'Connection dropped recently; retrying.';
  }
  if (status.status === 'disconnected') {
    return 'No recent wired phone connection is visible.';
  }
  if (status.status === 'error') {
    return 'The watcher hit an error. Open logs for details.';
  }
  return 'Watching for a wired phone connection.';
}

function flash() {
  elements.app.classList.remove('flash');
  requestAnimationFrame(() => elements.app.classList.add('flash'));
}

function titleCase(value) {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(time) {
  const value = Number(time);
  if (!value) {
    return 'Never';
  }
  const diff = Math.max(0, Date.now() - value);
  if (diff < 1_500) {
    return 'now';
  }
  if (diff < 60_000) {
    return `${Math.round(diff / 1_000)}s ago`;
  }
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
