# Phone Charge Guardian

Tiny local utility for flaky wired phone USB/charging connections.

It watches for a recently connected phone, attempts a small number of conservative USB/ADB recovery actions when the connection drops, and exposes a minimal localhost status page.

## Limits

Software cannot fix a cable that fully loses electrical contact. This helps with softer failures: USB/ADB transport stalls, brief re-enumeration drops, and host-side connection flakiness.

## Requirements

- Node.js 20+
- Android Platform Tools (`adb`) for Android recovery actions
- Optional platform USB tools:
  - macOS: built-in `ioreg`
  - Linux: `lsusb`
  - Windows: PowerShell `Get-PnpDevice`

## Run

```sh
npm start
```

Open `http://127.0.0.1:3769`.

## Background Install

macOS:

```sh
npm run install:mac
```

Linux:

```sh
npm run install:linux
```

Windows PowerShell:

```powershell
.\scripts\install-windows-task.ps1
```

## Recovery Behavior

The default recovery path is intentionally narrow:

1. Ensure the ADB server is running.
2. Reset offline ADB transports.
3. If still missing on the next retry, restart the ADB server.
4. After two retries, assume the phone was actually unplugged.

The macOS-wide `usbd` kick is disabled by default because it can affect unrelated USB devices. To opt in:

```sh
PHONE_CHARGE_GUARDIAN_ALLOW_USBD_KICK=1 npm start
```

## Resource Use

Defaults are tuned for low overhead:

- 5 second poll interval.
- Expensive platform USB probes run only every third poll when wired ADB already confirms the phone.
- Browser clients receive status only on state/recovery events, not on every sample.
- The UI renders one compact status card; logs are hidden until expanded.

Useful environment variables:

```sh
PHONE_CHARGE_GUARDIAN_PORT=3769
PHONE_CHARGE_GUARDIAN_POLL_MS=5000
PHONE_CHARGE_GUARDIAN_USB_PROBE_EVERY=3
PHONE_CHARGE_GUARDIAN_GRACE_MS=20000
PHONE_CHARGE_GUARDIAN_MAX_RETRIES=2
PHONE_CHARGE_GUARDIAN_ADB=adb
```

## Test

```sh
npm test
```
