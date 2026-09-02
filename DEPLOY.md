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
| PATTERNWRIGHT_ADMIN_PASSWORD | Bootstrap | Plaintext bootstrap password; hashed in-memory with scrypt at boot. Prefer HASH in production. |
| PATTERNWRIGHT_ADMIN_PASSWORD_HASH | Preferred in prod | Precomputed scrypt hash; omit plaintext password when set |
| PATTERNWRIGHT_SESSION_SECRET | Yes in production with password auth | Log fingerprint only (not cookie signing). Rotating it does **not** invalidate sessions. |
| PATTERNWRIGHT_ADMIN_KEY | Optional | Legacy/automation header x-patternwright-key |
| PATTERNWRIGHT_DB | Optional | SQLite path (default ./data/patternwright.db) |
| HOST / PORT | Optional | Bind address (Compose publishes 127.0.0.1:8787 only; container still listens 0.0.0.0:8787) |
| PATTERNWRIGHT_TRUST_PROXY | Behind TLS proxy | Honor X-Forwarded-*. Only safe when the app is not reachable except via the proxy. |
| PATTERNWRIGHT_SECURE_COOKIES | Behind HTTPS | Force Secure on session cookie |
| PATTERNWRIGHT_SESSION_TTL_MS | Optional | Session lifetime (default 12h) |
| NODE_ENV | Production | Set `production`. Boot refuses to start if no password/hash/admin key is configured. |

Copy .env.example to .env and fill secrets. .env is gitignored.

Production will not start in open mode: at least one of `PATTERNWRIGHT_ADMIN_PASSWORD`, `PATTERNWRIGHT_ADMIN_PASSWORD_HASH`, or `PATTERNWRIGHT_ADMIN_KEY` must be set when `NODE_ENV=production`.

### First-admin bootstrap

1. Choose a strong password.
2. Set PATTERNWRIGHT_ADMIN_USER, PATTERNWRIGHT_ADMIN_PASSWORD, and PATTERNWRIGHT_SESSION_SECRET.
3. Start the server.
4. Open /os and sign in with that username/password.
5. Prefer rotating to PATTERNWRIGHT_ADMIN_PASSWORD_HASH and removing plaintext ADMIN_PASSWORD from the env file.

Generate a session secret with: openssl rand -hex 32

### Revoking sessions

Sessions are opaque rows in SQLite (`sessions` table). `PATTERNWRIGHT_SESSION_SECRET` is only a startup log fingerprint — changing it does not log anyone out.

To revoke sessions:

- Signed-in (or admin-key) call: `POST /api/auth/sessions/revoke-all` with CSRF header when using a cookie session
- Or stop the process and wipe rows: `DELETE FROM sessions;` against the SQLite database

## Option A — Docker Compose (recommended)

1. Copy .env.example to .env and set ADMIN_PASSWORD (or HASH) plus SESSION_SECRET. Production compose sets `NODE_ENV=production`, so auth is mandatory.
2. Run: docker compose up -d --build
3. Confirm health via the TLS proxy (or locally): `curl http://127.0.0.1:8787/api/health`
4. SQLite persistence uses Docker volume patternwright-data mounted at /data.
5. Put Caddy or nginx in front for HTTPS; proxy to `127.0.0.1:8787`. Compose binds the published port to loopback only (`127.0.0.1:8787:8787`) so clients cannot hit the app directly and spoof `X-Forwarded-For` while `PATTERNWRIGHT_TRUST_PROXY=true`. Do not publish `8787:8787` on all interfaces.

## Option B — Single VM

1. Install Node 22.5+ on the VM.
2. Sync the repo to /opt/patternwright; keep SQLite under /var/lib/patternwright.
3. Create /etc/patternwright.env (mode 0600) with production values. Use HOST=127.0.0.1 and PATTERNWRIGHT_DB=/var/lib/patternwright/patternwright.db.
4. Run under a dedicated system user via a process supervisor: working directory /opt/patternwright, command node server.mjs, load EnvironmentFile, restart on failure, write access only to the data directory.
5. Terminate TLS on a reverse proxy and forward to 127.0.0.1:8787. Keep TRUST_PROXY only when the app binds to loopback (or is otherwise unreachable except through that proxy).

## Verification

Run the package check script plus the local harness in scripts/. Cover health, protected routes, sign-in flow, write guards, public intake, and restart durability. Details live in STRESS_TEST.md.

## Hardening notes

- Public intake remains open but rate-limited with basic email validation. Public Fit Check responses are ack-only (`ok` + `leadId`); atlas / preDiscovery stay server-side.
- OS and mutating APIs require a signed-in session or optional admin API key.
- Cookies use HttpOnly and SameSite=Lax; Secure is set for HTTPS.
- Mutating cookie-authenticated requests (including logout) require a CSRF header.
- In-memory rate limits reset on process restart and are per-process (not shared across replicas).
- Prefer `PATTERNWRIGHT_ADMIN_PASSWORD_HASH` over plaintext `PATTERNWRIGHT_ADMIN_PASSWORD` in production.
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
