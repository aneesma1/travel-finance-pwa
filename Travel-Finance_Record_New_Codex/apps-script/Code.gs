const APP_VERSION = '0.1.0';
const SHEET_NAMES = {
  people: 'People',
  trips: 'Trips',
  documents: 'Documents',
  transactions: 'Transactions',
  settings: 'Settings',
  auditLog: 'AuditLog',
};

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    const request = parseRequest_(e, method);
    const action = request.action || 'getBootstrap';
    const result = routeAction_(action, request);
    return jsonOutput_({ ok: true, data: result, error: null, meta: meta_() });
  } catch (error) {
    return jsonOutput_({ ok: false, data: null, error: error.message || 'Unknown error', meta: meta_() });
  }
}

function parseRequest_(e, method) {
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    const body = JSON.parse(e.postData.contents || '{}');
    return body;
  }
  return (e && e.parameter) || {};
}

function routeAction_(action, request) {
  switch (action) {
    case 'health':
      return { status: 'ok', version: APP_VERSION };
    case 'getBootstrap':
      return getBootstrapData_();
    default:
      throw new Error('Unsupported action: ' + action);
  }
}

function getBootstrapData_() {
  return {
    people: readSheetObjects_(SHEET_NAMES.people),
    trips: readSheetObjects_(SHEET_NAMES.trips),
    documents: readSheetObjects_(SHEET_NAMES.documents),
    transactions: readSheetObjects_(SHEET_NAMES.transactions),
    settings: readSettingsMap_(),
  };
}

function readSettingsMap_() {
  const rows = readSheetObjects_(SHEET_NAMES.settings);
  return rows.reduce(function (acc, row) {
    if (row.key) acc[row.key] = row.value;
    return acc;
  }, {});
}

function readSheetObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);
  return values.slice(1)
    .filter(function (row) {
      return row.some(function (cell) { return cell !== ''; });
    })
    .map(function (row) {
      return headers.reduce(function (obj, header, index) {
        obj[header] = normalizeCell_(row[index]);
        return obj;
      }, {});
    });
}

function normalizeCell_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function meta_() {
  return {
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}