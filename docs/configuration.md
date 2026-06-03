# Configuration

Platform Status Monitor uses bundled JSON configuration for the MVP. The Worker
imports `config/install.json` at build time.

The public repo includes example config only. Private installs should keep their
non-secret config in a private fork or private deployment repo.

Secrets are referenced by name and stored outside git.

## Dashboard Tiers

Platform cards can be grouped from JSON with `dashboard.tiers`.

```json
{
  "dashboard": {
    "tiers": [
      {"id": "tier-1", "displayName": "Tier 1", "platforms": ["airtable"]},
      {"id": "tier-2", "displayName": "Tier 2", "platforms": []},
      {"id": "tier-3", "displayName": "Tier 3", "platforms": []}
    ]
  }
}
```

If tiers are omitted, the dashboard falls back to three tiers using the platform
order from `platforms`.

## Validate Config

```bash
pnpm validate:config
```

Validation catches:

- unknown venue references
- unknown platform references
- unknown service references
- schema errors

## Export JSON Schema

Generate `config/install.schema.json` for editors and agent tooling:

```bash
pnpm export:schema
```

Point JSON-aware editors or coding agents at that schema before editing install
config. This helps catch typos in venue types, provider types, routing options,
and dependency fields before deployment.

## Provider Types

Use `providerType` when a provider is not Statuspage-compatible or when you want
to avoid probing the wrong API shape.

- `statuspage`: polls `/api/v2/incidents.json`
- `rss`: checks the configured `rssFeedUrl` or a standard history feed
- `incidentio`: uses the RSS-compatible fallback for incident.io-hosted pages
- `instatus`: uses the RSS-compatible fallback for Instatus-hosted pages
- `synthetic`: checks `syntheticCheckUrl` or `statusPageUrl`

Region-specific incident text is normalized into zones such as `br`, `us`, `eu`,
`au`, `asia`, and provider region IDs. A dependent with `global` does not match a
regional incident unless the provider incident itself is global.
