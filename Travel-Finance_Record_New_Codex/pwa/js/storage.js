const CACHE_KEY = 'tf-record-bootstrap';
const API_KEY = 'tf-record-api-base-url';

export function saveBootstrapCache(payload) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

export function loadBootstrapCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveApiBaseUrl(url) {
  localStorage.setItem(API_KEY, url);
}

export function loadApiBaseUrl() {
  return localStorage.getItem(API_KEY) || '';
}