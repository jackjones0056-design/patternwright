# Patternwright Production Core Architecture

Customer Site → `POST /api/fit-checks` → SQLite company + lead + pre-discovery record

Patternwright OS → `GET/PUT /api/state` → shared persistent state

Atlas → `GET /api/atlas` → seeded/public-evidence profiles

Discovery → `POST /api/reason` → evidence-separated reasoning contract

Enrichment → `POST /api/enrichment/queue` → provider-neutral queue for future web/data connectors

## SQLite entities
- companies
- leads
- discovery
- proposals
- projects
- settings
- atlas_profiles
- enrichment_jobs
- audit_events

## Deliberate boundaries
- No external AI API is required. `/api/reason` uses `rules-v1` and explicitly reports that provider.
- No scraping engine is bundled. Atlas enrichment has a queue/import contract so a compliant provider can be attached later.
- Authentication is optional locally and required before public deployment.
