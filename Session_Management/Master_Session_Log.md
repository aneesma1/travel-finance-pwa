# Master Session Ledger (Travel-Finance Suite)

This map tracks major transformations occurring across the Travel-Finance project since its architectural split on `2026-04-10`.

## Architecture Split Overview
* **Legacy PWA System (`/Travel-Vault_PWA`):** Frozen state of the previous real-time Google Drive synchronization app. This serves as the master baseline reference.
* **Native Android System (`/Travel-Vault_Android`):** Active development environment utilizing Capacitor wrapper, offline-first manual Drive sync, and native exit hooks.

## Session Index
### April 2026
**1. The "Sandbox Split" (2026-04-10)**
- **Scope:** Root Directory restructuring.
- **Actions:** 
  - Moved `app-a`, `app-b`, and `shared` to `Travel-Vault_PWA/`.
  - Authored Closing Blueprints for PWA preserving knowledge of real-time sync mechanisms.
  - Setup isolated `Travel-Vault_Android/` sandbox for the upcoming native conversion.

*(Append future major milestones here...)*
