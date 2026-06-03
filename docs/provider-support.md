# Provider Support

Current provider adapter support:

- Atlassian Statuspage-compatible incident polling via `/api/v2/incidents.json`
- Generic RSS
- incident.io RSS-compatible fallback
- Instatus RSS-compatible fallback
- Generic synthetic HTTP checks

Adapters normalize provider-specific payloads into one incident shape before the
routing engine runs.

The Worker polls configured platforms on its scheduled trigger, stores active
normalized incidents in KV, routes them against the bundled JSON config, and
exposes the latest ingestion metadata at `/api/ingestion/latest`.

Provider URLs must use `https` and must not target localhost, link-local, or
private network ranges. Worker provider fetches use request timeouts and cap
response bodies before parsing.
