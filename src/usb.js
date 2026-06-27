const PHONE_VENDOR_IDS = new Set([
  0x04e8, // Samsung
  0x05ac, // Apple
  0x18d1, // Google
  0x22b8, // Motorola
  0x2a70, // OnePlus
  0x0bb4, // HTC
  0x12d1, // Huawei
  0x2717 // Xiaomi
]);

const PHONE_TEXT_RE = /\b(android|iphone|ipad|samsung|pixel|google|motorola|oneplus|huawei|xiaomi|mobile)\b/i;
const NON_PHONE_TEXT_RE = /\b(hub|keyboard|mouse|trackpad|receiver|audio|camera|storage|bluetooth|ethernet)\b/i;

export function parseIoregUsbDevices(output) {
  const devices = [];
  let current = null;

  for (const line of String(output || '').split(/\r?\n/)) {
    const header = line.match(/^[\s|]*\+-o\s+(.+?)@\S+\s+<class IOUSBHostDevice\b([^>]*)>/);
    if (header) {
      current = {
        name: header[1],
        productName: header[1],
        vendorName: null,
        serial: null,
        locationId: null,
        vendorId: null,
        productId: null,
        rawHeader: line.trim()
      };
      devices.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const property = parseIoregProperty(line);
    if (!property) {
      continue;
    }

    const [key, value] = property;
    if (key === 'USB Product Name' || key === 'kUSBProductString') {
      current.productName ||= value;
    } else if (key === 'USB Vendor Name' || key === 'kUSBVendorString') {
      current.vendorName ||= value;
    } else if (key === 'USB Serial Number' || key === 'kUSBSerialNumberString') {
      current.serial ||= value;
    } else if (key === 'locationID') {
      current.locationId ??= Number(value);
    } else if (key === 'idVendor') {
      current.vendorId ??= Number(value);
    } else if (key === 'idProduct') {
      current.productId ??= Number(value);
    }
  }

  return devices;
}

export function parseLsusbDevices(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s+(.+)$/i);
      if (!match) {
        return null;
      }
      const label = match[5].trim();
      return {
        name: label,
        productName: label,
        vendorName: label.split(/\s{2,}|,/)[0] || null,
        serial: null,
        locationId: `${match[1]}-${match[2]}`,
        vendorId: Number.parseInt(match[3], 16),
        productId: Number.parseInt(match[4], 16),
        rawHeader: line
      };
    })
    .filter(Boolean);
}

export function parseWindowsPnpUsbDevices(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [friendlyName = '', instanceId = '', status = ''] = line.split('|');
      const ids = instanceId.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
      const serial = instanceId.split('\\').filter(Boolean).at(-1) || null;
      if (!ids) {
        return null;
      }
      return {
        name: friendlyName,
        productName: friendlyName,
        vendorName: friendlyName,
        serial,
        locationId: instanceId,
        vendorId: Number.parseInt(ids[1], 16),
        productId: Number.parseInt(ids[2], 16),
        rawHeader: line,
        status
      };
    })
    .filter(Boolean);
}

export function classifyPhoneDevices(devices) {
  return devices
    .map((device) => classifyPhoneDevice(device))
    .filter(Boolean);
}

export function parseAdbDevices(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices'))
    .map((line) => {
      const parts = line.split(/\s+/);
      const [serial, state, ...detailParts] = parts;
      const details = {};
      for (const part of detailParts) {
        const splitAt = part.indexOf(':');
        if (splitAt > 0) {
          details[part.slice(0, splitAt)] = part.slice(splitAt + 1);
        }
      }
      return {
        serial,
        state: state || 'unknown',
        details,
        isWired: !serial.includes(':') || detailParts.some((part) => part.startsWith('usb:')),
        raw: line
      };
    });
}

function classifyPhoneDevice(device) {
  const label = [device.productName, device.vendorName, device.name].filter(Boolean).join(' ');
  const knownVendor = PHONE_VENDOR_IDS.has(Number(device.vendorId));
  const looksLikePhone = PHONE_TEXT_RE.test(label);
  const looksLikeNonPhone = NON_PHONE_TEXT_RE.test(label);

  if ((!knownVendor && !looksLikePhone) || looksLikeNonPhone) {
    return null;
  }

  const kind = /\b(iphone|ipad|apple)\b/i.test(label)
    ? 'ios'
    : /\b(android|samsung|pixel|google|motorola|oneplus|huawei|xiaomi)\b/i.test(label)
      ? 'android'
      : 'phone';

  return {
    ...device,
    kind,
    confidence: knownVendor || looksLikePhone ? 'high' : 'medium'
  };
}

function parseIoregProperty(line) {
  const match = line.match(/"([^"]+)"\s+=\s+("([^"]*)"|[0-9]+|Yes|No)/);
  if (!match) {
    return null;
  }

  const rawValue = match[2];
  if (rawValue.startsWith('"')) {
    return [match[1], match[3] ?? ''];
  }
  if (rawValue === 'Yes') {
    return [match[1], true];
  }
  if (rawValue === 'No') {
    return [match[1], false];
  }
  return [match[1], Number(rawValue)];
}
