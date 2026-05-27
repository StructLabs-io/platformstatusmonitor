# Agent Instructions

This repo is designed to be configured by coding agents.

## Rules

- Edit JSON config files directly.
- Never commit real secrets.
- Use placeholder secret names in examples.
- Run `pnpm validate:config` after config changes.
- Explain every routing rule changed.
- Keep public config generic and private install config out of this public repo.

## Common Tasks

To add a platform:

1. Edit `config/install.example.json` or a private install config.
2. Add platform services and zones.
3. Add dependent dependencies.
4. Add routing rules.
5. Run `pnpm validate:config`.

To add a notification venue:

1. Add a venue object with secret names, not secret values.
2. Add routing rule actions that reference the venue ID.
3. Run `pnpm validate:config`.

