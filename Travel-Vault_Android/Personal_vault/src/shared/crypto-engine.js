// v5.5.0 — Local-First Edition
// AES-GCM Web Crypto Engine for Secure Offline Backups

'use strict';

const ITERATIONS = 100000;
const KEY_LEN = 256;
const SALT_LEN = 16;
const IV_LEN = 12;

// Helper: Convert string to ArrayBuffer
function strToBuffer(str) {
  return new TextEncoder().encode(str);
}

// Helper: Convert ArrayBuffer to string
function bufferToStr(buf) {
  return new TextDecoder().decode(buf);
}

// Helper: ArrayBuffer to Base64
function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Base64 to ArrayBuffer
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive AES-GCM key from password and salt
async function deriveKey(password, saltBuffer) {
  const passKey = await window.crypto.subtle.importKey(
    'raw',
    strToBuffer(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    passKey,
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a JSON object into a Base64 string payload using AES-GCM.
 * The payload structure is: [Salt (16 bytes)] + [IV (12 bytes)] + [Ciphertext]
 */
export async function encryptData(dataObject, password) {
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LEN));

    const key = await deriveKey(password, salt);

    const plaintext = strToBuffer(JSON.stringify(dataObject));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      plaintext
    );

    // Combine Salt + IV + Ciphertext
    const payload = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    payload.set(salt, 0);
    payload.set(iv, salt.length);
    payload.set(new Uint8Array(ciphertext), salt.length + iv.length);

    // Return as Base64 encoded string so it can be easily saved/shared as a text block
    return bufferToBase64(payload.buffer);
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error('Encryption failed. Check console for details.');
  }
}

/**
 * Decrypts a Base64 string payload back into a JSON object using AES-GCM.
 */
export async function decryptData(base64Payload, password) {
  try {
    const payloadBuffer = base64ToBuffer(base64Payload);
    const payload = new Uint8Array(payloadBuffer);

    // Extract Salt, IV, and Ciphertext
    const salt = payload.slice(0, SALT_LEN);
    const iv = payload.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const ciphertext = payload.slice(SALT_LEN + IV_LEN);

    const key = await deriveKey(password, salt);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );

    const decryptedString = bufferToStr(decryptedBuffer);
    return JSON.parse(decryptedString);
  } catch (err) {
    console.error('Decryption failed:', err);
    throw new Error('WRONG_PASSWORD'); // Uniform error string for easy matching
  }
}
