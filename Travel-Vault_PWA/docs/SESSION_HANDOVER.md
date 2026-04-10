# SESSION HANDOVER — Travel Finance PWA Suite
## Date: 16 March 2026 | Status: All phases built, syntax-verified, ready for logic audit

---

## 1. WHAT IS BUILT — COMPLETE FEATURE LIST

### App A — Family Hub (indigo #3730A3)
- **Dashboard** — live status cards per member, days in Qatar/India, yearly Qatar total, document expiry countdowns, urgent doc alert banner, filter bar (person/location/doc-status), share as PNG + WhatsApp text copy, family-grouped view (couples + children shown together)
- **Travel Log** — scrollable list, filter by person + year, swipe-to-delete, tap to edit
- **Add/Edit Trip** — 5-step form: person pill, 4 date pickers with live day calculation, smart-search flights, smart-search reason, travel-with multi-pill, review step. Duplicate detection, ETag-safe save
- **Documents** — cards per person, life bars, colour-coded expiry status, alert toggles
- **Add/Edit Document** — Google Calendar API integration: creates/updates/deletes events per alert day (90d/60d/30d). Events have colour codes and dual reminders
- **People tab (5th nav item)** — grouped member cards, Family Defaults button at top
- **Person Profile** — 4 tabs:
  - Profile: photo (base64 compressed), personal info, blood group, medical notes, work details
  - Locations: Qatar + India addresses, 3-method map picker (GPS / paste maps link / Nominatim search), OSM iframe preview, coordinates + Plus Code, copy location button
  - Emergency: priority contacts, Contact Picker API, Emergency Card PNG, QR code (vCard), copy text
  - Documents: per-member doc cards
- **Family Defaults** — 3 tabs: Addresses (shared Qatar/India), Contacts (shared emergency contacts), Tree (SVG family tree)
- **Family Tree** — SVG diagram, add relationship modal with live auto-reverse preview, auto-emergency-contact prompt, bidirectional storage
- **Settings** — member CRUD, local backup download, Drive mirror restore (3 snapshots), import tool, sign-out
- **CSV/Excel Import** — 4-step wizard: file pick, column mapping with fuzzy auto-match, preview with validation, bulk import with duplicate detection
- **Expiry Checker** — runs on app load, sticky banner, browser Notifications API, fills missed calendar events
- **PDF Export** — A5 contact cards (jsPDF), one page per person, selectable members

### App B — Private Vault (emerald #065F46)
- **PIN Lock** — SHA-256 hashed, 5-attempt lockout, 30s countdown, setup/change/forgot PIN
- **Dashboard** — Income/Spend/Net per currency, currency tabs (QAR/INR/USD), filter bar (year/month/category/account), recent 10 transactions, share as PNG + WhatsApp text
- **Add/Edit Transaction** — date picker, smart-search description, dual amount fields, currency pills, category1+2 pills (add custom), notes, account pills, live preview card
- **Transaction List** — grouped by month with subtotals, running balance bar, all filters, swipe-to-delete
- **Analytics** — monthly bar chart, category donut (spend/income toggle), year-over-year bars, top categories — all Canvas API (no library)
- **Settings** — 4 tabs: Data (backup/restore/categories/mirror), Export (xlsx download + email via Web Share API), Security (change PIN), Account (sign-out)
- **Excel Export** — SheetJS, filtered data, download + email (Web Share API + mailto fallback)
- **CSV/Excel Import** — same shared import tool as App A

### Shared infrastructure
- Google OAuth 2.0 PKCE (no client secret in browser)
- Google Drive JSON backend (travel_data.json + finance_data.json)
- ETag conflict detection with 3-retry logic
- Two-tier backup: local JSON download + Drive mirror (TravelFinanceApp_Mirror, last 3 snapshots)
- IndexedDB offline cache (loads from cache, syncs on reconnect)
- Service Workers (cache-v2, periodic background sync for mirror)
- PWA install prompts (Android + iOS hint)
- Offline sync queue (replays queued writes when back online)
- SmartInput (debounced suggestions), PillSelect (single/multi)

---

## 2. FILE STRUCTURE — 45 FILES

```
travel-finance-pwa/
├── SETUP_GUIDE.md
├── app-a-family-hub/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/app.css
│   ├── icons/icon-192.png + icon-512.png
│   └── js/
│       ├── auth-config.js       ← CLIENT_ID goes here
│       ├── calendar.js          ← Google Calendar API wrapper
│       ├── expiry-checker.js    ← runs on boot, browser notifications
│       ├── relation-engine.js   ← family tree logic (pure functions)
│       ├── router.js
│       └── screens/
│           ├── dashboard.js
│           ├── travel-log.js
│           ├── add-trip.js
│           ├── documents.js
│           ├── add-document.js
│           ├── people.js
│           ├── person-profile.js
│           ├── family-defaults.js
│           └── settings.js
├── app-b-private-vault/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/app.css
│   ├── icons/icon-192.png + icon-512.png
│   └── js/
│       ├── auth-config.js       ← CLIENT_ID goes here
│       ├── pin.js
│       ├── router.js
│       └── screens/
│           ├── pin-lock.js
│           ├── dashboard.js
│           ├── add-transaction.js
│           ├── transactions.js
│           ├── analytics.js
│           └── settings.js
└── shared/
    ├── auth.js
    ├── drive.js
    ├── db.js
    ├── utils.js
    ├── smart-input.js
    ├── pill-select.js
    ├── import-tool.js
    ├── pwa-install.js
    └── sync-queue.js
```

---

## 3. DATA MODEL — travel_data.json

```json
{
  "schemaVersion": 1,
  "lastSync": "ISO8601",
  "members": [
    {
      "id": "uuid",
      "name": "Ahmed",
      "emoji": "👨",
      "color": "#EEF2FF",
      "photo": "data:image/jpeg;base64,...",
      "dateOfBirth": "YYYY-MM-DD",
      "nationality": "Indian",
      "bloodGroup": "O+",
      "phone": "+974...",
      "email": "...",
      "occupation": "Engineer",
      "employer": "Company",
      "employerPhone": "+974...",
      "medicalNotes": "Allergic to...",
      "personalNotes": "...",
      "homeQatarOverride": null,
      "homeIndiaOverride": null,
      "personalEmergencyContacts": [],
      "emergencyContacts": []
    }
  ],
  "trips": [...],
  "documents": [...],
  "familyDefaults": {
    "homeQatar": { "label": "", "address": "", "lat": null, "lng": null, "plusCode": "", "mapsUrl": "" },
    "homeIndia":  { "label": "", "address": "", "lat": null, "lng": null, "plusCode": "", "mapsUrl": "" },
    "emergencyContacts": []
  },
  "familyRelations": [
    { "id": "uuid", "fromId": "memberA-id", "relation": "Husband", "toId": "memberB-id" }
  ]
}
```

---

## 4. DEPLOYMENT

- **GitHub repo:** https://github.com/aneesma1/travel-finance-pwa
- **Live URL:** https://aneesma1.github.io/travel-finance-pwa/
- **App A:** https://aneesma1.github.io/travel-finance-pwa/app-a-family-hub/
- **App B:** https://aneesma1.github.io/travel-finance-pwa/app-b-private-vault/
- **Google Cloud project:** Travel Finance App
- **Client ID:** 36787254386-o0pikuppj1ebcceh4qrjofu3fvqch6bo.apps.googleusercontent.com
- **APIs enabled:** Google Drive API, Google Calendar API
- **Test user:** aneesaluva@gmail.com
- **OAuth redirect URIs:** localhost 8080/5500/5501/3000 + github.io URLs for both apps

---

## 5. KNOWN ISSUES — MUST FIX IN NEXT SESSION

### Critical (will cause errors)
1. **people.js** — has duplicate `export-pdf-btn` event listener (line 28 and 236). Remove the duplicate at line 28 or 236.
2. **dashboard.js** — duplicate renderMemberCards was removed but needs runtime verification that grouped view renders correctly.
3. **person-profile.js** — `import { CLIENT_ID }` is missing — the Calendar sync in add-document.js uses calendar.js module but person-profile.js needs to confirm it doesn't reference CLIENT_ID directly.
4. **settings.js (App A)** — `openImportModal` function calls `openImportModal(container, data, members)` but the function signature `openImportModal(container, data, members)` was added above `openMemberModal` — verify the function is reachable.

### Logic issues (may cause incorrect behaviour)
5. **relation-engine.js** — `buildFamilyGroups` assigns unvisited members but the `assignedSet` variable in `buildSiblingGroups` receives a reference — verify siblings are not left in the `stillUnassigned` list after being grouped.
6. **family-defaults.js** — `removeRelation` is imported from `relation-engine.js` but used inline as a local arrow function (`rr`) in the tree tab delete handler — should use the imported function directly.
7. **person-profile.js locations tab** — `renderLocationsTab()` calls `bindLocationEvents()` which references `draft` from closure — verify this works after re-render.
8. **App B settings export** — `uuidv4` imported but only used in `openFinanceImportModal` — verify import is present.

### Minor
9. **SW cache** — both sw.js files reference old `export.js` path that no longer exists in App B. Already fixed but verify.
10. **people.js** — after the rewrite, `buildMemberCard` function references `openPdfExportModal` which is defined lower in the file — JS hoisting handles function declarations but not `async function` — verify it's defined as a regular `async function` not an arrow function const.

---

## 6. NEXT SESSION INSTRUCTIONS

When user returns, say:

**"Welcome back. I have full context of your project. Before giving you the final package, I will do a complete audit of all 45 files — fixing all known issues, removing duplicate code, verifying all imports and exports, and testing logic consistency. This will produce one clean final zip you can push entirely to GitHub. Shall I start the audit now?"**

Then:
1. Read every file using the view tool
2. Fix all 10 issues listed above
3. Check all import paths are consistent (relative paths like `../../shared/` vs `../../../shared/`)
4. Verify every screen exported function is registered in the router
5. Check all CDN libraries are loaded correctly (jsPDF, QRCode, SheetJS, html2canvas)
6. Produce final clean zip + updated Blueprint with audit session log entry
7. Give deployment instructions for GitHub push

---

## 7. HOW TO DEPLOY AFTER NEXT SESSION

1. Download the new zip
2. Extract — replace entire `travel-finance-pwa` folder contents
3. Make sure `auth-config.js` in both apps has the Client ID (it's already in the files)
4. Open GitHub Desktop
5. You'll see all changed files listed
6. Type commit message: `Full audit and clean rebuild`
7. Commit to main → Push origin
8. Wait 3 minutes → GitHub Pages auto-deploys
9. Hard refresh (Ctrl+Shift+R) on the live URL
10. Test sign-in → app should load correctly

---

*End of session handover — 16 March 2026*
