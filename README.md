# Platform Status Monitor

Agent-configurable platform status monitoring for teams, agencies, and solo
operators.

The MVP uses bundled JSON configuration, a Cloudflare Worker for ingestion/API,
Workers KV for runtime state, and a read-only Next.js dashboard.

## Status

This project is in early MVP development.

- Read-only webapp
- JSON-first config
- Webapp-only routing decisions
- Telegram planned after the dashboard is fully functional

## Architecture

```text
status providers
  -> Cloudflare Worker
  -> normalized incidents and routing decisions in KV
  -> Next.js dashboard on Cloudflare Pages
```

## Local Development

```bash
pnpm install
pnpm check
pnpm test
pnpm validate:config
```

Run the Worker:

```bash
pnpm --filter @platform-status-monitor/worker dev
```

Run the webapp:

```bash
pnpm --filter @platform-status-monitor/web dev
```

## Secrets

Never commit real tokens or webhook secrets. Use `.dev.vars` locally and
Cloudflare secrets in deployed environments.

