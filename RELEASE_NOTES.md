# Patternwright v2.1 — Production Core

## Completed
- Added zero-dependency Node + SQLite backend.
- Connected the public Fit Check to a real same-origin ingestion endpoint.
- Added persistent company, lead, discovery, proposal, project, settings, Atlas, enrichment-job, and audit records.
- Patternwright OS auto-hydrates from backend and auto-syncs changes.
- Standalone previews remain usable without a server.
- Added evidence-separated `/api/reason` contract with deterministic fallback.
- Added Atlas profile API and enrichment queue hook.
- Added optional admin-key protection for non-public API endpoints.
- Seeded the backend with all 11 current Atlas profiles.

## Still requires deployment decisions
- HTTPS/domain.
- User authentication/authorization for a public deployment.
- A compliant live business-data/enrichment provider.
- Optional LLM provider for reasoning beyond `rules-v1`.
- First backend connection now migrates an existing local workspace instead of replacing it with an empty database.
- When both local and backend data exist, records merge by ID with backend records winning field conflicts.
- Admin credentials are never sent in workspace state and are redacted from JSON exports.
