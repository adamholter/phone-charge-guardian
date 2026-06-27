export function getUsbProbe(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      command: '/usr/sbin/ioreg',
      args: ['-p', 'IOUSB', '-l', '-w', '0'],
      parser: 'ioreg'
    };
  }

  if (platform === 'linux') {
    return {
      command: 'lsusb',
      args: [],
      parser: 'lsusb'
    };
  }

  if (platform === 'win32') {
    return {
      command: process.env.PHONE_CHARGE_GUARDIAN_POWERSHELL || 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB*' } | ForEach-Object { \"$($_.FriendlyName)|$($_.InstanceId)|$($_.Status)\" }"
      ],
      parser: 'windows-pnp'
    };
  }

  return null;
}

export function shouldRunUsbProbe({ pollCount, usbProbeEvery, hasKnownPhone, hasAdbDevice }) {
  if (!hasKnownPhone || !hasAdbDevice) {
    return true;
  }
  return pollCount % Math.max(1, usbProbeEvery) === 0;
}
