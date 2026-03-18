// v2.1 — 2026-03-18
// ─── app-b-private-vault/js/pin.js ──────────────────────────────────────────
// PIN management for Private Vault
// SHA-256 hash, 5-attempt lockout, 30-second cooldown

'use strict';

const PIN_HASH_KEY     = 'vault_pin_hash';
const ATTEMPTS_KEY     = 'vault_pin_attempts';
const LOCKOUT_KEY      = 'vault_pin_lockout_until';
const MAX_ATTEMPTS     = 5;
const LOCKOUT_SECONDS  = 30;

// ── SHA-256 hash ──────────────────────────────────────────────────────────────
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data    = encoder.encode('vault_salt_2026_' + pin); // salted
  const hash    = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── PIN state ─────────────────────────────────────────────────────────────────
export function isPinSet() {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

export async function setPin(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  const hashed = await hashPin(pin);
  localStorage.setItem(PIN_HASH_KEY, hashed);
  resetAttempts();
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

  const hashed = await hashPin(pin);
  if (hashed === stored) {
    resetAttempts();
    return true;
  }

  // Failed attempt
  const attempts = incrementAttempts();
  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + (LOCKOUT_SECONDS * 1000);
    localStorage.setItem(LOCKOUT_KEY, String(lockUntil));
    resetAttempts();
    throw new Error(`LOCKED:${LOCKOUT_SECONDS}`);
  }

  throw new Error(`WRONG:${MAX_ATTEMPTS - attempts}`);
}

export async function changePin(currentPin, newPin) {
  const valid = await verifyPin(currentPin).catch(() => false);
  if (!valid) throw new Error('Current PIN is incorrect');
  await setPin(newPin);
}

export function clearPin() {
  localStorage.removeItem(PIN_HASH_KEY);
  resetAttempts();
}

// ── Lockout helpers ───────────────────────────────────────────────────────────
function resetAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

function incrementAttempts() {
  const current = Number(localStorage.getItem(ATTEMPTS_KEY) || 0) + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(current));
  return current;
}

export function getLockoutSecondsRemaining() {
  const lockoutUntil = Number(localStorage.getItem(LOCKOUT_KEY) || 0);
  if (Date.now() >= lockoutUntil) return 0;
  return Math.ceil((lockoutUntil - Date.now()) / 1000);
}
