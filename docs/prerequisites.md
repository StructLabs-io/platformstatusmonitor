# Prerequisites

Platform Status Monitor is designed for agent-assisted setup, but the agent
still needs a working local and Cloudflare environment.

## Local Tools

- Node.js 24 or newer
- pnpm 11.1.2
- Git
- Docker, if you use the recommended GitHub Actions secret scan locally
- A coding agent or IDE that can edit JSON and run shell commands

Install dependencies from the repo root:

```bash
pnpm install
```

Run the baseline checks:

```bash
pnpm check
pnpm test
pnpm validate:config
pnpm build
```

## Cloudflare

You need a Cloudflare account with permission to manage:

- Cloudflare Pages projects
- Cloudflare Workers
- Workers KV namespaces
- Worker routes or custom domains, if you want production URLs
- Cloudflare Access, if the dashboard should be private
- Worker secrets for provider tokens and notification credentials

Install and authenticate Wrangler:

```bash
pnpm --dir apps/worker exec wrangler login
```

For non-interactive agent runs, use environment variables instead of a browser
login:

```bash
export CLOUDFLARE_ACCOUNT_ID="replace-with-account-id"
export CLOUDFLARE_API_TOKEN="replace-with-api-token"
```

The API token should be scoped to the target account and should only include the
permissions needed for the deployment you are performing.

## Configuration

The MVP is JSON-first. Start from `config/install.example.json` and create your
own `config/install.json` in your private install repo.

Do not commit real secrets. Config files should reference secret names only.
Store secret values in `.dev.vars` for local Worker development or in
Cloudflare Worker secret storage for deployed environments.

## Agent Checklist

Before asking an agent to deploy or modify an install, make sure it can:

- Read this repository
- Edit JSON files
- Run `pnpm` commands
- Access Wrangler authentication through `wrangler login` or environment vars
- See the target Cloudflare account ID
- Avoid printing or committing secret values
