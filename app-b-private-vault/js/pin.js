// v3.3.2 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── app-b-private-vault/js/pin.js ──────────────────────────────────────────
// PIN management -- SHA-256 with random per-device salt
// Random salt generated at first PIN setup, stored in localStorage
// Attacker cannot crack PIN without physical access to the device

'use strict';

const PIN_HASH_KEY     = 'vault_pin_hash';
const PIN_SALT_KEY     = 'vault_pin_salt';      // ← random, per-device
const ATTEMPTS_KEY     = 'vault_pin_attempts';
const LOCKOUT_KEY      = 'vault_pin_lockout_until';
const MAX_ATTEMPTS     = 5;
const LOCKOUT_SECONDS  = 30;

// ── Generate random salt ──────────────────────────────────────────────────────
function generateSalt() {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Get or create salt ────────────────────────────────────────────────────────
function getSalt() {
  let salt = localStorage.getItem(PIN_SALT_KEY);
  if (!salt) {
    salt = generateSalt();
    localStorage.setItem(PIN_SALT_KEY, salt);
  }
  return salt;
}

// ── SHA-256 hash with per-device salt ────────────────────────────────────────
async function hashPin(pin) {
  const salt    = getSalt();
  const encoder = new TextEncoder();
  const data    = encoder.encode(salt + ':' + pin);
  const hash    = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── PIN state ─────────────────────────────────────────────────────────────────
export function isPinSet() {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

export async function setPin(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  // Ensure fresh salt exists before hashing
  getSalt();
  const hashed = await hashPin(pin);
  localStorage.setItem(PIN_HASH_KEY, hashed);
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

export async function verifyPin(pin) {
  // Check lockout
  const lockoutUntil = Number(localStorage.getItem(LOCKOUT_KEY) || 0);
  if (Date.now() < lockoutUntil) {
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    throw new Error(`LOCKED:${remaining}`);
  }

  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) throw new Error('No PIN set');

  const hashed  = await hashPin(pin);
  const correct = hashed === stored;

  if (correct) {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
    return true;
  }

  // Track failed attempts
  const attempts = Number(localStorage.getItem(ATTEMPTS_KEY) || 0) + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(attempts));

  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_SECONDS * 1000;
    localStorage.setItem(LOCKOUT_KEY, String(lockUntil));
    localStorage.removeItem(ATTEMPTS_KEY);
    throw new Error(`LOCKED:${LOCKOUT_SECONDS}`);
  }

  return false;
}

export async function changePin(currentPin, newPin) {
  const valid = await verifyPin(currentPin);
  if (!valid) throw new Error('Current PIN is incorrect');
  // Generate a fresh salt on PIN change for extra security
  localStorage.removeItem(PIN_SALT_KEY);
  await setPin(newPin);
}

export function clearPin() {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(PIN_SALT_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

export function getLockoutSecondsRemaining() {
  const lockoutUntil = Number(localStorage.getItem(LOCKOUT_KEY) || 0);
  if (Date.now() < lockoutUntil) {
    return Math.ceil((lockoutUntil - Date.now()) / 1000);
  }
  return 0;
}
