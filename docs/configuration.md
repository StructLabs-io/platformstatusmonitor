# Configuration

Platform Status Monitor uses bundled JSON configuration for the MVP.

The public repo includes example config only. Private installs should keep their
non-secret config in a private fork or private deployment repo.

Secrets are referenced by name and stored outside git.

## Validate Config

```bash
pnpm validate:config
```

Validation catches:

- unknown venue references
- unknown platform references
- unknown service references
- schema errors

