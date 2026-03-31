import { renderDashboardScreen } from './screens/dashboard.js';
import { renderPeopleScreen } from './screens/people.js';
import { renderTripsScreen } from './screens/trips.js';
import { renderDocumentsScreen } from './screens/documents.js';
import { renderFinanceScreen } from './screens/finance.js';
import { renderSettingsScreen } from './screens/settings.js';

const screenRenderers = {
  dashboard: renderDashboardScreen,
  people: renderPeopleScreen,
  trips: renderTripsScreen,
  documents: renderDocumentsScreen,
  finance: renderFinanceScreen,
  settings: renderSettingsScreen,
};

export function renderRoute(route, context) {
  const renderer = screenRenderers[route] || renderDashboardScreen;
  return renderer(context);
}