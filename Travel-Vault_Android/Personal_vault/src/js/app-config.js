// v5.5.0 — Local-First Edition
// Drive-based app config is replaced by local-only PIN storage.
// PIN hash is stored in localStorage and never leaves the device.

'use strict';

export async function saveConfigToDrive() { }
export async function restoreConfigFromDrive() { return null; }
export async function syncPinToDrive() { }
export async function restorePinFromDrive() { return false; }
