import { state } from './state.js';

export async function fetchBootstrap() {
  if (!state.apiBaseUrl) {
    throw new Error('Missing Apps Script URL. Add it in Settings first.');
  }

  const url = new URL(state.apiBaseUrl);
  url.searchParams.set('action', 'getBootstrap');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Bootstrap request failed with status ' + response.status);
  }

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || 'Unknown Apps Script error');
  }

  return payload.data;
}