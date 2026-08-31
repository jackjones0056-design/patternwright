# Patternwright v2.1 — Production Core

This package turns the Patternwright prototype into a working local client/server system with persistent SQLite data and no external runtime dependencies.

## Run

Requires Node.js 22.5+ (Node 24 is ideal).

```bash
npm start
```

Open:
- Customer site: http://127.0.0.1:8787/
- Patternwright OS: http://127.0.0.1:8787/os

The first run creates `data/patternwright.db`.

## What is live

- Public Fit Check POSTs directly into SQLite when served by this server.
- Patternwright OS hydrates from the same backend.
- OS changes debounce-sync back to SQLite.
- Atlas has 11 seeded profiles in the backend and the app-safe HTML fallback.
- Discovery can call `/api/reason` for evidence-separated deterministic reasoning.
- Atlas enrichment jobs can be queued for a future enrichment provider.
- Full JSON import/export and standalone/local fallback remain intact.

## Security boundary

This is a production-core baseline, not an internet-hardened multi-user SaaS. Before exposing it publicly, put it behind HTTPS and authentication. Set `PATTERNWRIGHT_ADMIN_KEY` to require an admin key for OS API routes; the public `/api/fit-checks` endpoint intentionally remains open.

Do not submit or store sensitive, regulated, medical, financial-account, or government nonpublic data.

## Repository layout

- `public/index.html` — customer-facing Patternwright shell
- `public/os.html` — Patternwright OS shell
- `public/css/` + `public/js/` — production UI assets
- `public/fragments/` — server-injected Atlas no-JS fallback
- `public/assets/` — Patternwright logo assets
- `server.mjs` — Node/SQLite production-core server
- `data/` — runtime SQLite data (ignored by Git)
