# Telegram Notification Filters

Telegram is the only channel that gets gated by this filter layer. The dashboard always displays every incident the providers emit — filtering happens only at the notifier boundary.

## Why

Provider feeds (Cloudflare in particular) emit a lot of incidents that don't affect anything we run — pop-level events in regions we don't use, cosmetic components, low-severity items. The filter block in `config/install.json` cuts those before they hit Telegram while keeping the dashboard truthful.

## Schema

Optional block under `notificationFilters` in `config/install.json`:

```jsonc
{
  "notificationFilters": {
    "severityFloor": ["critical", "major"],
    "perPlatform": {
      "<platformId>": {
        "enabled": true,
        "componentAllowlist": ["service-id", "..."],
        "componentDenylist": ["service-id", "..."],
        "regionAllowlist": ["zone-id", "..."]
      }
    }
  }
}
```

All keys are optional; every shape is backward-compatible.

### Fields

| Field | Type | Default | Behavior |
|---|---|---|---|
| `severityFloor` | `("critical" \| "major")[]` | `["critical", "major"]` | Severities that pass to Telegram. Anything below silences. Empty array = no severity gate. |
| `perPlatform.<id>.enabled` | `boolean` | `true` | `false` silences the platform on Telegram entirely. |
| `perPlatform.<id>.componentAllowlist` | `string[]` | unset | If set, incident must mention at least one listed service. |
| `perPlatform.<id>.componentDenylist` | `string[]` | unset | If set, incident is silenced when any listed service appears. |
| `perPlatform.<id>.regionAllowlist` | `string[]` | unset | If set, incident's zones must intersect this list. |

### Evaluation order

An incident reaches Telegram only when **all** of the following pass, in this order. The first failure determines the silence reason logged + persisted.

1. `severityFloor` — `severity-floor`
2. `perPlatform[id].enabled !== false` — `platform-disabled`
3. `componentAllowlist` (if set) — `component-not-allowed`
4. `componentDenylist` (if set) — `component-denied`
5. `regionAllowlist` (if set) — `region-not-allowed`

### Pass-through default

A platform with no entry under `perPlatform` is treated as `{ enabled: true }` with no allowlists or denylists. The severity floor still applies.

## Shipped defaults

There are no shipped per-platform defaults in this public template. The severity floor is the only built-in gate.

The example below is illustrative only — edit to match your own footprint.

| Platform | Severity floor | Components | Regions |
|---|---|---|---|
| (all) | `critical`, `major` | — | — |
| `cloudflare` | inherits | `workers`, `pages`, `dns`, `r2` | `global`, `us`, `eu` |

## How silences surface

- **Worker logs (`wrangler tail`):**
  - Per-silence: `[tg-notifier] silenced {"incidentId":"…","platform":"…","reason":"…"}`
  - Tick summary (when any incident was silenced): `[tg-notifier] tick-summary {"checkedAt":"…","silencedTotal":N,"silencedByReason":{…}}`
- **KV (`PSM_STATE`):** key `tg:silenced:<incidentId>:<status>` with `{silenced:true, reason, silencedAt}`, 30-day TTL. Same namespace as the existing `tg:*` keys — no new namespace.
- **Dashboard:** the `/api/incidents/recent` payload attaches `silenced: { telegram: { silenced, reason } | null }` per incident. The overview platform cards and the incidents table render a `🔕` badge with the reason as tooltip.

## Editing the config

1. Edit `config/install.json` — add or change the `notificationFilters` block.
2. From repo root:
   ```bash
   pnpm --filter @platform-status-monitor/shared run validate:config
   pnpm --filter @platform-status-monitor/shared run export:schema
   ```
3. Commit and push. The worker + Pages auto-deploy on push to `main`.

## Relationship to the existing notifier pipeline

The filter runs **before** the existing active-hours gate, dependent-matching, dedup, and migration parallel-run logic in `apps/worker/src/notifiers/telegram.ts`. Any single filter failure means Telegram silence — but every later stage still runs for non-silenced incidents exactly as before.
