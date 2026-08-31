# Patternwright v2.1 Production Core — Validation Report

Date: 2026-08-30

## Passed

### API / persistence smoke test
- Server startup with zero external packages
- SQLite schema creation
- 11 Atlas profiles seeded
- Public Fit Check ingestion
- Company + lead creation
- Shared OS state read/write
- Evidence-separated `rules-v1` reasoning contract
- Atlas search

### Durability / security-boundary test
- Customer website served at `/`
- Patternwright OS served at `/os`
- SQLite lead survives server restart
- Optional `PATTERNWRIGHT_ADMIN_KEY` blocks OS API routes without the key
- Public Fit Check remains available when admin protection is enabled

### Standalone/app-preview test
- Customer standalone loads without backend
- OS standalone loads without backend
- Local-mode status renders correctly
- 11 Atlas cards present
- Atlas #001 profile and likely operational issues are visible
- 390px mobile viewport has no horizontal page overflow
- No browser runtime errors in standalone test

### Browser integration test with mocked backend
- Fit Check success path updates customer-facing message
- OS hydrates a backend lead
- Backend-connected status renders
- Discovery calls reasoning provider contract
- `rules-v1` provider is visibly identified
- 390px mobile layout remains clean

## Production boundaries still intentionally open
- HTTPS/domain deployment
- Real user authentication/authorization rather than an optional shared admin key
- Live public-business enrichment provider
- Optional LLM reasoning provider beyond deterministic `rules-v1`
- Email/CRM/calendar integrations

The environment blocks direct Chromium navigation to local HTTP servers, so server behavior was validated by HTTP/API tests and browser behavior was validated independently with standalone and mocked-backend DOM tests.
