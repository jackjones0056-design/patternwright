# Patternwright v2.1.1 — Deploy readiness

## Completed in this release
- Session-based admin login (scrypt password from env / hash) with HttpOnly cookies
- CSRF protection for cookie-authenticated mutating API calls
- Rate limits on public Fit Check, login, and general API traffic
- Security headers, safer error responses (no stack-trace leaks), secret redaction in audits/exports
- Optional legacy `PATTERNWRIGHT_ADMIN_KEY` retained as automation fallback
- Docker + Compose path and single-VM runbook in DEPLOY.md
- Local smoke harness in scripts/smoke.mjs

## Completed earlier (v2.1 Production Core)
- Zero-dependency Node + SQLite backend
- Public Fit Check → SQLite ingestion
- Persistent companies, leads, discovery, proposals, projects, settings, Atlas, enrichment jobs, audit
- OS hydrate/sync, Atlas seed (11), `/api/reason` rules-v1
- Standalone previews without a server

## Still operator-owned
- Domain / DNS / HTTPS terminator
- Host account and production secrets
- Optional enrichment/LLM providers (not bundled)
