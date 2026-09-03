# Patternwright v2.1 — Production Core

Zero-dependency Node + SQLite system for Patternwright customer site and OS.

**Product positioning:** AI integration and workflows are the core (ops OS, Fit Check, Atlas, discovery, automation for businesses). Website builds for Gulf Coast / South Mississippi local businesses — redesigns, booking/quote CTAs — are an explicit secondary offering on the public site, not a replacement for the workflow product.

## Run locally

Requires Node.js 22.5+ (Node 24 is ideal).

```bash
cp .env.example .env
# set PATTERNWRIGHT_ADMIN_PASSWORD and PATTERNWRIGHT_SESSION_SECRET for auth
node server.mjs
```

Or use the start script from package.json.

Open:
- Customer site: http://127.0.0.1:8787/
- Patternwright OS: http://127.0.0.1:8787/os

The first run creates `data/patternwright.db`.

## Authentication (deploy-ready)

Session login is the primary protection for OS / admin / mutating APIs:

1. Set `PATTERNWRIGHT_ADMIN_USER` (default `admin`)
2. Set `PATTERNWRIGHT_ADMIN_PASSWORD` (or `PATTERNWRIGHT_ADMIN_PASSWORD_HASH`)
3. Set `PATTERNWRIGHT_SESSION_SECRET` (required when `NODE_ENV=production`)

Sign in at `/os`. Cookies are HttpOnly + SameSite=Lax (+ Secure behind HTTPS). Mutating session requests require `x-csrf-token`.

Optional: `PATTERNWRIGHT_ADMIN_KEY` remains an automation fallback via `x-patternwright-key`.

Public `POST /api/fit-checks` stays open and rate-limited.

## Deploy

See [DEPLOY.md](./DEPLOY.md) for Docker Compose and single-VM runbooks, env var list, SQLite volume persistence, verification checklist, and rollback notes.

## What is live

- Public marketing site: AI workflows primary; Website builds section for local business sites / redesigns / booking CTAs
- Public Fit Check POSTs into SQLite when served by this server
- Patternwright OS hydrates from the same backend (after sign-in when auth is enabled)
- OS changes debounce-sync back to SQLite
- Atlas has 11 seeded profiles
- Discovery can call `/api/reason` for evidence-separated deterministic reasoning
- Full JSON import/export and standalone/local fallback remain intact

## Security boundary

Do not submit or store sensitive, regulated, medical, financial-account, or government nonpublic data.

Before public exposure: HTTPS, session auth env vars, and the DEPLOY.md checklist.

## Repository layout

- `public/` — customer site + OS assets
- `server.mjs` — Node/SQLite production-core server
- `scripts/smoke.mjs` — local API verification harness
- `Dockerfile` + `docker-compose.yml` — container deploy path
- `data/` — runtime SQLite data (ignored by Git)
