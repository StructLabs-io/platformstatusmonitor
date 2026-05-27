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
