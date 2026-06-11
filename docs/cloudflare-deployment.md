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

```bash
printf "%s" "replace-with-read-token" | pnpm --dir apps/worker exec wrangler secret put PSM_READ_TOKEN
printf "%s" "replace-with-admin-token" | pnpm --dir apps/worker exec wrangler secret put PSM_ADMIN_TOKEN
printf "%s" "replace-with-token" | pnpm --dir apps/worker exec wrangler secret put TELEGRAM_BOT_TOKEN
printf "%s" "replace-with-chat-id" | pnpm --dir apps/worker exec wrangler secret put TELEGRAM_CHAT_ID
printf "%s" "replace-with-topic-id" | pnpm --dir apps/worker exec wrangler secret put TELEGRAM_TOPIC_ID
printf "%s" "replace-with-webhook-url" | pnpm --dir apps/worker exec wrangler secret put SLACK_WEBHOOK_URL
```

The read token protects full Worker read APIs such as `/api/config`,
`/api/decisions/recent`, `/api/ingestion/providers`, and
`/api/deliveries/recent`. The admin token protects `/api/admin/refresh` and
`/api/admin/test-notification`.

Keep `/health` public. The only unauthenticated dashboard data endpoint is
`/api/public/dashboard`, which intentionally omits dependents, routing rules,
venue secret references, delivery logs, and raw provider payloads.

Restrict browser access with `PSM_ALLOWED_ORIGINS`:

```toml
[vars]
PSM_ALLOWED_ORIGINS = "https://status.example.com"
PSM_PUBLIC_READS = "false"
```

If you build a static Pages app that calls private Worker APIs directly, set
`NEXT_PUBLIC_READ_TOKEN` only behind Cloudflare Access or another private
front-door. Otherwise, use the redacted public dashboard endpoint.

## Cloudflare Access

For private installs, put the Pages domain behind Cloudflare Access:

1. Create a Zero Trust application for the Pages custom domain.
2. Add an allow policy for the team members or identity groups that can view the
   dashboard.
3. Leave the Worker API public only if the dashboard must call it directly from
   the browser. For stricter installs, route API calls through the same protected
   domain and apply Access there too.
4. Keep provider webhook endpoints separate from protected human dashboard
   routes if external providers need to call them.

## Scripted Deploy

`scripts/deploy.sh` wraps the build + Wrangler + smoke-test flow for both apps.
It reads all operator-specific values from environment variables, with
`scripts/deploy.env` (gitignored) and `<repo>/.env` as fallbacks.

```bash
cp scripts/deploy.env.example scripts/deploy.env
# Fill in CLOUDFLARE_API_TOKEN, PSM_WORKER_URL, PSM_PAGES_URL, PSM_PAGES_PROJECT_NAME
./scripts/deploy.sh worker        # deploy Worker only
./scripts/deploy.sh web           # build + deploy Pages
./scripts/deploy.sh all           # worker, then web
./scripts/deploy.sh worker --dry-run   # print resolved config + commands, run nothing
```

Required variables:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Pages + Workers + KV scope.
- `PSM_WORKER_URL` — public URL of the deployed Worker. Baked into the Next.js
  bundle as `NEXT_PUBLIC_WORKER_BASE_URL` and used by smoke tests.
- `PSM_PAGES_URL` — public URL of the deployed Pages site (smoke tests).
- `PSM_PAGES_PROJECT_NAME` — Cloudflare Pages project name.

Optional: `PSM_DEPLOY_BRANCH` (defaults to `main`).

## Release Checklist

Before release:

- Run `pnpm check`, `pnpm test`, `pnpm validate:config`, and `pnpm build`.
- Run `pnpm export:schema` after schema changes.
- Confirm public repos contain placeholders only.
- Confirm private install config contains no token values, chat IDs, or webhook
  URLs.
- Confirm `PSM_ALLOWED_ORIGINS` does not use `*`.
- Confirm full read APIs return `401` without `PSM_READ_TOKEN`.
- Deploy the Worker, trigger `/api/admin/refresh`, and confirm
  `/api/ingestion/latest`.
- Build Pages with `NEXT_PUBLIC_WORKER_BASE_URL` set to the deployed Worker.
- Smoke-test dashboard, incidents, platforms, routes, dependents, venues, and
  agent setup pages.
