# Spreadsheet Schema

This document defines the first spreadsheet layout for the Google Sheets backend.

## Spreadsheet Tabs

Create one spreadsheet with these tabs in this order:

1. `People`
2. `Trips`
3. `Documents`
4. `Transactions`
5. `Settings`
6. `AuditLog`

## Headers

### People

```text
id | name | nickname | phone | email | nationality | notes | isActive | createdAt | updatedAt
```

### Trips

```text
id | personId | personName | fromCountry | toCountry | dateOut | dateIn | reason | flightNumber | companions | notes | status | createdAt | updatedAt
```

### Documents

```text
id | personId | personName | documentType | documentNumber | issueDate | expiryDate | issuingCountry | notes | createdAt | updatedAt
```

### Transactions

```text
id | date | type | amount | currency | category | subCategory | account | description | notes | createdAt | updatedAt
```

### Settings

```text
key | value | updatedAt
```

Suggested starter rows:

```text
appName | Travel Finance Record New Codex | <ISO timestamp>
defaultCurrency | QAR | <ISO timestamp>
homeCountry | Qatar | <ISO timestamp>
alertDays | 90,60,30 | <ISO timestamp>
```

### AuditLog

```text
id | timestamp | actor | action | entityType | entityId | status | details
```

## Notes

- All dates returned to the frontend should be normalized to ISO strings where practical.
- `companions` can start as a comma-separated string in Sheets and later become a JSON string if needed.
- Keep headers exactly aligned with the Apps Script mapping helpers.