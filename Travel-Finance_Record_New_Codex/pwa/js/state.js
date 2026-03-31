export const state = {
  route: 'dashboard',
  bootstrap: {
    people: [],
    trips: [],
    documents: [],
    transactions: [],
    settings: {},
  },
  lastSyncAt: null,
  apiBaseUrl: '',
};

export function setRoute(route) {
  state.route = route;
}

export function setBootstrapData(data) {
  state.bootstrap = {
    people: Array.isArray(data.people) ? data.people : [],
    trips: Array.isArray(data.trips) ? data.trips : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    settings: data.settings || {},
  };
  state.lastSyncAt = new Date().toISOString();
}

export function setApiBaseUrl(url) {
  state.apiBaseUrl = url.trim();
}