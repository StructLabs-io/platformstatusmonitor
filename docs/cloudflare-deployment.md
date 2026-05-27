# Cloudflare Deployment

MVP deployment uses:

- Cloudflare Pages for the static Next.js dashboard
- Cloudflare Worker for API, webhooks, cron, and KV state
- Workers KV for recent incidents and routing decisions

Read `docs/prerequisites.md` first. The deploying user or agent needs Wrangler
authentication, a Cloudflare account ID, and permissions for Pages, Workers, KV,
and secrets.

## Worker

Copy `apps/worker/wrangler.toml.example` to `apps/worker/wrangler.toml` and set
the KV namespace ID.

Create a KV namespace:

```bash
pnpm --dir apps/worker exec wrangler kv namespace create PSM_STATE
```

Deploy the Worker:

```bash
pnpm --dir apps/worker exec wrangler deploy
```

## Webapp

Set `NEXT_PUBLIC_WORKER_BASE_URL` to the deployed Worker URL before building the
Next.js app.

Build and deploy the static app to Cloudflare Pages:

```bash
NEXT_PUBLIC_WORKER_BASE_URL="https://replace-with-worker-url" pnpm --filter @platform-status-monitor/web build
pnpm --dir apps/worker exec wrangler pages deploy apps/web/out --project-name platform-status-monitor
```

## Secrets

Use Cloudflare secrets for private tokens.
