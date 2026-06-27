import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPhoneDevices,
  parseAdbDevices,
  parseIoregUsbDevices,
  parseLsusbDevices,
  parseWindowsPnpUsbDevices
} from '../src/usb.js';

const ioregFixture = `
+-o AppleT8142USBXHCI@01000000  <class AppleT8142USBXHCI, id 0x100000431, registered, matched, active, busy 0 (570 ms), retain 75>
  +-o SAMSUNG_Android@01100000  <class IOUSBHostDevice, id 0x10001d34d, registered, matched, active, busy 0 (11 ms), retain 35>
      {
        "USB Product Name" = "SAMSUNG_Android"
        "locationID" = 17825792
        "idVendor" = 1256
        "idProduct" = 26720
        "USB Vendor Name" = "SAMSUNG"
        "USB Serial Number" = "R5CWA33NC2M"
      }
  +-o USB2.1 Hub@01200000  <class IOUSBHostDevice, id 0x100000abc, registered, matched, active, busy 0, retain 18>
      {
        "USB Product Name" = "USB2.1 Hub"
        "locationID" = 18874368
        "idVendor" = 10509
        "idProduct" = 10245
        "USB Vendor Name" = "Generic"
      }
`;

test('parseIoregUsbDevices extracts USB host devices with stable identity fields', () => {
  const devices = parseIoregUsbDevices(ioregFixture);

  assert.equal(devices.length, 2);
  assert.deepEqual(devices[0], {
    name: 'SAMSUNG_Android',
    productName: 'SAMSUNG_Android',
    vendorName: 'SAMSUNG',
    serial: 'R5CWA33NC2M',
    locationId: 17825792,
    vendorId: 1256,
    productId: 26720,
    rawHeader: '+-o SAMSUNG_Android@01100000  <class IOUSBHostDevice, id 0x10001d34d, registered, matched, active, busy 0 (11 ms), retain 35>'
  });
});

test('classifyPhoneDevices recognizes connected Android phones and ignores hubs', () => {
  const phones = classifyPhoneDevices(parseIoregUsbDevices(ioregFixture));

  assert.equal(phones.length, 1);
  assert.equal(phones[0].productName, 'SAMSUNG_Android');
  assert.equal(phones[0].kind, 'android');
  assert.equal(phones[0].confidence, 'high');
});

test('parseAdbDevices keeps wired transports separate from wireless transports', () => {
  const devices = parseAdbDevices(`List of devices attached
R5CWA33NC2M            device usb:1-1 product:r0qsqw model:SM_S901U device:r0q transport_id:10
192.168.1.196:5555     device product:r0qsqw model:SM_S901U device:r0q transport_id:3
`);

  assert.equal(devices.length, 2);
  assert.equal(devices[0].serial, 'R5CWA33NC2M');
  assert.equal(devices[0].isWired, true);
  assert.equal(devices[1].isWired, false);
});

test('parseLsusbDevices extracts Linux USB phones', () => {
  const devices = parseLsusbDevices('Bus 001 Device 004: ID 04e8:6860 Samsung Electronics Co., Ltd Galaxy series, misc. (MTP mode)');
  const phones = classifyPhoneDevices(devices);

  assert.equal(phones.length, 1);
  assert.equal(phones[0].vendorId, 0x04e8);
  assert.equal(phones[0].kind, 'android');
});

test('parseWindowsPnpUsbDevices extracts Windows USB phones', () => {
  const devices = parseWindowsPnpUsbDevices('Samsung Mobile USB Composite Device|USB\\\\VID_04E8&PID_6860\\\\R5CWA33NC2M|OK');
  const phones = classifyPhoneDevices(devices);

  assert.equal(phones.length, 1);
  assert.equal(phones[0].serial, 'R5CWA33NC2M');
  assert.equal(phones[0].vendorId, 0x04e8);
});
