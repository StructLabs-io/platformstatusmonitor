# Cloudflare Deployment

MVP deployment uses:

- Cloudflare Pages for the static Next.js dashboard
- Cloudflare Worker for API, webhooks, cron, and KV state
- Workers KV for recent incidents and routing decisions

## Worker

Copy `apps/worker/wrangler.toml.example` to `apps/worker/wrangler.toml` and set
the KV namespace ID.

## Webapp

Set `NEXT_PUBLIC_WORKER_BASE_URL` to the deployed Worker URL before building the
Next.js app.

## Secrets

Use Cloudflare secrets for private tokens.

