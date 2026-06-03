# Platform Status Monitor — Implementation Plan

This checklist tracks the OSS MVP implementation. The public repo must stay generic:
no private platform selections, client maps, chat IDs, tokens, or organization-specific
routing rules.

## MVP Boundary

- [x] Next.js webapp on Cloudflare Pages.
- [x] Separate Cloudflare Worker API.
- [x] JSON-first configuration with no database in the MVP.
- [x] KV-backed runtime indexes for recent incidents, decisions, validation, and ingestion metadata.
- [x] Webapp-only delivery for MVP.
- [x] Telegram delivery after the webapp is fully functional.
- [x] Slack delivery after Telegram or as v1.1.

## Public / Private Segregation

- [x] Public repo contains generic examples and placeholders only.
- [x] Public repo has GitHub Actions disabled by default with setup instructions.
- [x] Private fork owns internal install config, private Cloudflare project settings, and live deployment docs.
- [x] Keep generic improvements flowing public -> private without copying private config back upstream.

## Phase 0 — Planning And Review

- [x] Product spec drafted.
- [x] Routing dimensions documented.
- [x] MVP scope changed from D1 + Telegram-first to JSON/KV + webapp-first.
- [x] MIT license selected.
- [x] Agent-first setup approach selected.

## Phase 1 — Scaffold

- [x] TypeScript monorepo.
- [x] Worker app.
- [x] Next.js app.
- [x] Shared package for config schema, incidents, routing, and validation.
- [x] Example config files with placeholders only.
- [x] Cloudflare Pages/Worker deployment docs.
- [x] Self-hosted font option or documented production font decision.

## Phase 2 — Core Domain

- [x] Normalized incident type.
- [x] Dependent/platform/service/zone model.
- [x] Routing rule schema.
- [x] Delivery decision explanations.
- [x] Config validation.
- [x] Unit tests for routing.
- [x] Dedupe by incident lifecycle/status before external notifications.
- [x] Quiet-hours behavior in routing decisions.

## Phase 3 — Ingestion

- [x] Scheduled Worker job writes validation status to KV.
- [x] Statuspage-compatible incident polling writes active incidents and routing decisions to KV.
- [x] Ingestion metadata endpoint.
- [x] Generic RSS adapter for non-Statuspage feeds.
- [x] incident.io adapter.
- [x] Instatus adapter.
- [x] Synthetic HTTP checks.
- [x] Provider last-success / last-error display in the webapp.

## Phase 4 — Notifications

- [x] Webapp-only delivery records incident and decision state.
- [x] Telegram venue.
- [x] Telegram test notification endpoint.
- [x] Delivery result logging.
- [x] Slack venue.

## Phase 5 — Next.js Webapp

- [x] Dashboard metrics.
- [x] Tiered platform status cards.
- [x] Active incident card states.
- [x] Dependent impact banner.
- [x] Dark mode.
- [x] Incidents table.
- [x] Platform registry screen.
- [x] Dependents screen.
- [x] Routing rules screen.
- [x] Agent setup screen.
- [x] Notification venues screen.
- [x] Search/filter controls for incidents.
- [x] Provider ingestion health on platform cards or platform screen.

## Phase 6 — Agent-First Configuration

- [x] AGENTS.md.
- [x] JSON schema validation command.
- [x] Agent setup prompt in docs/webapp.
- [x] Prerequisites docs.
- [x] More example install profiles.
- [x] JSON schema export for editor/agent tooling.

## Phase 7 — Deployment

- [x] Worker secret placeholder docs.
- [x] Pages deploy docs.
- [x] GitHub Actions setup docs.
- [x] Smoke-test checklist.
- [x] Automated release checklist.
- [x] Cloudflare Access docs for private installs.

## Phase 8 — Private Migration

Private migration tasks are tracked only in the private fork. They must not be
copied into the public repo.
