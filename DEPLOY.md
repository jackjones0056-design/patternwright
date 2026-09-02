# Patternwright deploy runbook

Practical path for a single Node + SQLite host (Docker or bare VM). This is a single-operator business deploy, not multi-tenant SaaS.

## Prerequisites

- Node.js 22.5+ (Node 24 ideal) or Docker
- HTTPS terminator in front (Caddy, nginx, Traefik, or cloud load balancer)
- Domain DNS A/AAAA pointing at the host

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| PATTERNWRIGHT_ADMIN_USER | Recommended | Admin username (default admin) |
| PATTERNWRIGHT_ADMIN_PASSWORD | Yes for real deploy | Bootstrap password; hashed in-memory with scrypt at boot |
| PATTERNWRIGHT_ADMIN_PASSWORD_HASH | Alternate | Precomputed scrypt hash instead of plaintext password |
| PATTERNWRIGHT_SESSION_SECRET | Yes in production | Required when NODE_ENV=production and password auth is enabled |
| PATTERNWRIGHT_ADMIN_KEY | Optional | Legacy/automation header x-patternwright-key |
| PATTERNWRIGHT_DB | Optional | SQLite path (default ./data/patternwright.db) |
| HOST / PORT | Optional | Bind address (Docker default 0.0.0.0:8787) |
| PATTERNWRIGHT_TRUST_PROXY | Behind TLS proxy | Honor X-Forwarded-* |
| PATTERNWRIGHT_SECURE_COOKIES | Behind HTTPS | Force Secure on session cookie |
| PATTERNWRIGHT_SESSION_TTL_MS | Optional | Session lifetime (default 12h) |
| NODE_ENV | Production | Set production |

Copy .env.example to .env and fill secrets. .env is gitignored.

### First-admin bootstrap

1. Choose a strong password.
2. Set PATTERNWRIGHT_ADMIN_USER, PATTERNWRIGHT_ADMIN_PASSWORD, and PATTERNWRIGHT_SESSION_SECRET.
3. Start the server.
4. Open /os and sign in with that username/password.
5. Optionally rotate later to PATTERNWRIGHT_ADMIN_PASSWORD_HASH so plaintext password is not kept in the env file.

Generate a session secret with: openssl rand -hex 32

## Option A — Docker Compose (recommended)

1. Copy .env.example to .env and set ADMIN_PASSWORD plus SESSION_SECRET.
2. Run: docker compose up -d --build
3. Confirm health: curl the /api/health endpoint on port 8787.
4. SQLite persistence uses Docker volume patternwright-data mounted at /data.
5. Put Caddy or nginx in front for HTTPS; proxy to 127.0.0.1:8787; keep PATTERNWRIGHT_TRUST_PROXY=true.

## Option B — Single VM

1. Install Node 22.5+ on the VM.
2. Sync the repo to /opt/patternwright; keep SQLite under /var/lib/patternwright.
3. Create /etc/patternwright.env (mode 0600) with production values. Use HOST=127.0.0.1 and PATTERNWRIGHT_DB=/var/lib/patternwright/patternwright.db.
4. Run under a dedicated system user via a process supervisor: working directory /opt/patternwright, command node server.mjs, load EnvironmentFile, restart on failure, write access only to the data directory.
5. Terminate TLS on a reverse proxy and forward to 127.0.0.1:8787.
## Verification

Run the package check script plus the local harness in scripts/. Cover health, protected routes, sign-in flow, write guards, public intake, and restart durability. Details live in STRESS_TEST.md.

## Hardening notes

- Public intake remains open but rate-limited with basic email validation.
- OS and mutating APIs require a signed-in session or optional admin API key.
- Cookies use HttpOnly and SameSite=Lax; Secure is set for HTTPS.
- Mutating cookie-authenticated requests require a CSRF header.
- Secrets are redacted from audit details and stripped from exports.
- Do not store regulated or sensitive nonpublic data.

## Rollback

1. Stop the new process or container.
2. Restore the previous release directory or prior image tag.
3. Restore the database file from backup (prefer stop-then-copy).
4. Start the previous version with the same env file.
5. Re-run verification.

## Remaining manual steps for the operator

- Register domain and point DNS at the host
- Create the VPS or Docker host account
- Obtain TLS certificates
- Set production secrets in env files (not in git)
- Optional: off-host scheduled database backup
