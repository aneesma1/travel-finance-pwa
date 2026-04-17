# Architecure Blueprint v2: 100% Offline & Encrypted Native

**Date Set:** 2026-04-17
**Context:** This blueprint completely supersedes the cloud-heavy "Blueprint v1". After extensive architectural discussion, the decision was made to execute a total removal of the Google Cloud console reliance to eliminate Tester List requirements, improve battery, and ensure absolute data security.

## Core Directives Made During Planning
1. **Total Google Cloud API Removal (The Purge)**
   - Delete `auth.js` entirely. 
   - Strip out Google OAuth Client IDs and Drive API HTTP calls from both Private Vault and Travel Hub.
   - Delete all redundant UI tools currently tied to the cloud: Backup Health checks, Drive Security Audits, Connect Shared Hub buttons, and Clear Cache buttons.
   - The app must NEVER prompt for a Google Login at startup or anywhere else. It is a locked-down local island.

2. **The "Instant 15-Day Pruning" Mechanism**
   - The apps will generate local `.json` and `.xlsx` backups to the native Android Documents folder (`Documents/PrivateVault` and `Documents/TravelLog`).
   - *Battery Optimization:* Instead of running a battery-heavy background service, the pruning logic will execute in <100ms synchronously *during* the act of pressing "Save" or "Save & Exit". It will scan the local folder and delete any backup file older than 15 active days. Zero power consumed while the app is closed.

3. **AES-GCM Web Crypto Secure Sharing (Owner Export)**
   - The apps will use native browser Web Crypto (AES-GCM) to encrypt backup payloads.
   - Owners will click "Share Backup", type a custom password (e.g., `Secret123`), and the app generates an unreadable `.vaultbox` / `.travelbox` file.
   - Owners share this file securely using the native Android Share Menu (via WhatsApp, Email, or the Google Drive app).

4. **Native Android Intent Import (Viewer Workflow)**
   - Viewers no longer fetch from a Google Drive API queue.
   - Viewers tap the `.vaultbox` file they receive via WhatsApp or Drive.
   - The app launches natively, detects the encrypted extension, prompts for the Owner's password (`Secret123`), and imports the data silently into the Viewer's local database.
   - The password is required ONLY once during import.

5. **Fixing the Android App Crash**
   - The `renderDashboard is not defined` crash in Android will be fixed by moving the `<script>` tags in `index.html` back to `type="module"`, ensuring that the native browser evaluates the JS module tree correctly without breaking ES6 `import`/`export` logic.
