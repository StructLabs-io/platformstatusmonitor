# Changelog

## Unreleased

### Added

- **Telegram notification filter module** — per-platform allow/denylist,
  severity floor, dashboard silence badges. **Note: this release ships the
  filter module and config schema only; `apps/worker/src/index.ts` does not
  yet invoke `notifyTelegram`. Operators forking this template must wire it
  into their `scheduled` handler.** See
  [`docs/notification-filters.md`](docs/notification-filters.md) for the
  wiring snippet and known behavior around silence-marker TTL.

- **Build identity vars in example config** (`apps/worker/wrangler.toml.example`):
  `PSM_VERSION`, `PSM_BUILD_NUMBER`, and `PSM_GIT_SHA` vars added to the
  example config. Exposed via `/api/health` and the dashboard footer. Set these
  at deploy time with your deploy script or CI environment.

### Fixed

- **KV write cascade eliminated** (`apps/worker/src/index.ts`): Removed the
  legacy per-key fallback in `loadRuntimeSnapshot`. When `snapshot:latest` was
  absent (cold start or a prior tick killed by `exceededResources`), the old
  code issued 5+ index reads plus one KV read per tracked incident, decision,
  provider, and delivery record. The resulting CPU burst pushed the invocation
  past the Cloudflare free-tier scheduled-worker limit, which left
  `snapshot:latest` absent again on the next tick — a self-reinforcing loop.
  On a busy install this produced several thousand KV writes per day against a
  1,000/day free-tier cap, with a 10–12% cron error rate. Fix: if
  `snapshot:latest` is absent, return `EMPTY_SNAPSHOT` directly. The
  individual per-key records are not written by any current code path; the
  fallback was a migration artifact from an earlier storage model.

- **Duplicate daily cron removed** (`apps/worker/wrangler.toml.example`): The
  `scheduled` handler calls `runIngestion()` unconditionally — it does not
  branch on the cron expression or `event.scheduledTime`. The `17 3 * * *`
  (daily 03:17 UTC) schedule was a no-op duplicate of the `*/5 * * * *`
  five-minute cron. One extra invocation per day, zero extra behavior. Removed.
  Only `*/5 * * * *` remains.

### Changed

- **`PSM_PUBLIC_READS` default flipped to `true` in example config**
  (`apps/worker/wrangler.toml.example`): The example now defaults to
  `PSM_PUBLIC_READS = "true"`. Real access control is handled by
  `PSM_ALLOWED_ORIGINS`. Private installs should set `PSM_PUBLIC_READS =
  "false"` in their own `wrangler.toml`.

### Architecture note

`snapshot:latest` is the single source of truth for runtime state. Any deploy
or migration that clears this key will cause one empty-baseline cron tick
before state is rebuilt from live provider polls. This is expected and
acceptable — active incidents will be re-detected on the next tick.
