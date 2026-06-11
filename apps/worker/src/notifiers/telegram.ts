/**
 * Telegram notifier — independent notification layer for PSM.
 *
 * Called from runIngestion() in parallel with deliverDecisions(). Does NOT
 * go through the routing rule engine. Has its own KV namespace (tg:*) fully
 * isolated from delivery:fingerprint:* used by the webapp path.
 *
 * KV keys:
 *   tg:sent:{incidentId}:{status}  — per-incident dedup (30-day TTL)
 *   tg:sent:feedError:{platformId} — feed-error dedup (1-day TTL)
 *   tg:error:last                  — last delivery failure (no TTL)
 *   tg:active-set                  — JSON map of incidentId→ActiveEntry for all
 *                                    incidents currently in-flight (notified but
 *                                    not yet resolved). Used to detect implicit
 *                                    resolution when an incident disappears from
 *                                    the provider feed. (no TTL — managed manually)
 */

import {
  isDependentActive,
  getMatchedDependents,
  shouldSilenceTelegram,
  type Incident,
  type InstallConfig,
  type SilenceReason,
} from "@platform-status-monitor/shared";
import { getJson, putJson, type Env } from "../state/kv-state";
import type { ProviderIngestionStatus } from "../providers/types";

// ─── Public types ────────────────────────────────────────────────────────────

export interface TelegramDeliveryRecord {
  incidentId: string;
  status: string;
  ok: boolean;
  deliveredAt: string;
  message: string;
}

interface TgErrorRecord {
  ts: string;
  incidentId: string;
  status: string;
  httpCode: number | null;
  body: string;
}

/**
 * Tracks an in-flight (notified but not yet resolved) incident so we can
 * detect implicit resolution when the incident disappears from the provider feed.
 */
interface ActiveEntry {
  platform: string;
  severity: string;
  title: string;
  lastStatus: string;
}

// ─── KV keys ─────────────────────────────────────────────────────────────────

const ACTIVE_SET_KEY = "tg:active-set";

// ─── TTLs (seconds) ──────────────────────────────────────────────────────────

const TTL_INCIDENT_DEDUP = 30 * 24 * 60 * 60; // 30 days
const TTL_FEED_ERROR_DEDUP = 24 * 60 * 60; // 1 day
const TTL_SILENCED_MARKER = 30 * 24 * 60 * 60; // 30 days — dashboard 🔕 badge
const FEED_ERROR_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SilencedMarker {
  silenced: true;
  reason: SilenceReason;
  silencedAt: string;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * notifyTelegram — evaluate all incidents and fire Telegram alerts for state
 * transitions not yet delivered. Also runs feed-error detection for every
 * platform where ingestion has been failing for 24+ hours.
 *
 * Returns a record per attempted delivery (ok or failed). Dedup hits are
 * silently skipped (not returned in the list).
 */
export async function notifyTelegram(
  env: Env,
  config: InstallConfig,
  incidents: Incident[],
  checkedAt: string,
): Promise<TelegramDeliveryRecord[]> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const topicId = env.TELEGRAM_TOPIC_ID;

  // If secrets are not yet provisioned, bail silently — worker runs before
  // secrets are set during initial deployment. Log once for operators.
  if (!token || !chatId) {
    console.log("[tg-notifier] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping");
    return [];
  }

  const now = new Date(checkedAt);
  const records: TelegramDeliveryRecord[] = [];

  // Load the active-set: incidents we've previously alerted on that haven't resolved yet.
  const activeSet = await getJson<Record<string, ActiveEntry>>(
    env.PSM_STATE,
    ACTIVE_SET_KEY,
    {},
  );
  // Build a set of currently-live incident IDs for fast lookup.
  const currentIncidentIds = new Set(incidents.map((i) => i.id));

  // ── Per-incident loop ─────────────────────────────────────────────────────

  // Track silenced-by-filter counts for the tick-summary log.
  const silencedCounts: Partial<Record<SilenceReason, number>> = {};

  for (const incident of incidents) {
    // 0. Config-driven filter gate. Runs BEFORE the existing active-hours and
    //    dependent-matching checks so a single filter failure → Telegram silence.
    //    Dashboard surface is unaffected: the silenced marker is written to KV
    //    for the web app to render a 🔕 badge.
    const filterDecision = shouldSilenceTelegram(
      incident,
      config.notificationFilters,
    );
    if (filterDecision.silenced) {
      const reason = filterDecision.reason as SilenceReason;
      silencedCounts[reason] = (silencedCounts[reason] ?? 0) + 1;
      console.log(
        `[tg-notifier] silenced ${JSON.stringify({
          incidentId: incident.id,
          platform: incident.platform,
          reason,
        })}`,
      );
      const marker: SilencedMarker = {
        silenced: true,
        reason,
        silencedAt: checkedAt,
      };
      await putJson(
        env.PSM_STATE,
        `tg:silenced:${incident.id}:${incident.status}`,
        marker,
        { expirationTtl: TTL_SILENCED_MARKER },
      );
      continue;
    }

    // 1. Find matched dependents using shared helper (no logic duplication).
    const matchedDependents = getMatchedDependents(config, incident);
    if (matchedDependents.length === 0) continue;

    // 2. Severity gate: "none" is not a valid schema value but guard defensively.
    if ((incident.severity as string) === "none") continue;

    // 3. Evaluate active hours per dependent.
    const activeDependents = matchedDependents.filter((id) =>
      isDependentActive(config.dependents[id], now),
    );
    const outsideHoursDependents = matchedDependents.filter(
      (id) => !activeDependents.includes(id),
    );

    // 4. Apply severity override: major/critical always fire regardless of hours.
    const isCriticalSeverity =
      incident.severity === "critical" || incident.severity === "major";

    // 5. Active-hours gate for non-critical severities.
    if (!isCriticalSeverity && activeDependents.length === 0) continue;

    // 6. Dedup check.
    const dedupKey = `tg:sent:${incident.id}:${incident.status}`;
    const existing = await getJson<TelegramDeliveryRecord | null>(
      env.PSM_STATE,
      dedupKey,
      null,
    );
    if (existing) {
      // Even if already sent, keep the active-set entry current.
      if (!activeSet[incident.id]) {
        activeSet[incident.id] = {
          platform: incident.platform,
          severity: incident.severity,
          title: incident.title,
          lastStatus: incident.status,
        };
      }
      continue;
    }

    // 7. Format and send.
    const text = formatTelegramMessage(
      config,
      incident,
      matchedDependents,
      activeDependents,
      outsideHoursDependents,
    );
    const record = await sendTelegramMessage(
      env,
      token,
      chatId,
      topicId,
      incident.id,
      incident.status,
      text,
    );

    // 8. Write dedup key only on success; track in active-set.
    if (record.ok) {
      await putJson(env.PSM_STATE, dedupKey, record, { expirationTtl: TTL_INCIDENT_DEDUP });
      activeSet[incident.id] = {
        platform: incident.platform,
        severity: incident.severity,
        title: incident.title,
        lastStatus: incident.status,
      };
    }

    records.push(record);
  }

  // Tick-summary log for silenced-by-filter incidents (operators tail this in `wrangler tail`).
  const totalSilenced = Object.values(silencedCounts).reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  if (totalSilenced > 0) {
    console.log(
      `[tg-notifier] tick-summary ${JSON.stringify({
        checkedAt,
        silencedTotal: totalSilenced,
        silencedByReason: silencedCounts,
      })}`,
    );
  }

  // ── Implicit-resolution loop ───────────────────────────────────────────────
  // For every incident tracked in the active-set that is no longer in the
  // current provider feed, the incident has resolved (the RSS/statuspage
  // provider strips resolved items before they reach the notifier). Fire a
  // synthetic RESOLVED notification so the channel gets ✅.

  const resolvedIds: string[] = [];

  for (const [incidentId, entry] of Object.entries(activeSet)) {
    if (currentIncidentIds.has(incidentId)) continue; // still active

    // Check resolved dedup key — don't double-fire across ticks.
    const resolvedDedupKey = `tg:sent:${incidentId}:resolved`;
    const alreadySentResolved = await getJson<TelegramDeliveryRecord | null>(
      env.PSM_STATE,
      resolvedDedupKey,
      null,
    );
    if (alreadySentResolved) {
      // Clean up active-set — we've already notified resolution.
      resolvedIds.push(incidentId);
      continue;
    }

    // Build a synthetic resolved incident for formatting.
    const platform = config.platforms[entry.platform];
    const resolvedText = [
      `✅ [RESOLVED] ${platform?.displayName ?? entry.platform} — ${entry.title}`,
      `Severity: ${entry.severity.toUpperCase()}`,
      `Updated: ${checkedAt}`,
      platform?.statusPageUrl ? `→ ${platform.statusPageUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const record = await sendTelegramMessage(
      env,
      token,
      chatId,
      topicId,
      incidentId,
      "resolved",
      resolvedText,
    );

    if (record.ok) {
      await putJson(env.PSM_STATE, resolvedDedupKey, record, {
        expirationTtl: TTL_INCIDENT_DEDUP,
      });
      resolvedIds.push(incidentId);
    }

    records.push(record);
  }

  // Remove resolved incidents from the active-set and persist.
  for (const id of resolvedIds) {
    delete activeSet[id];
  }
  await putJson(env.PSM_STATE, ACTIVE_SET_KEY, activeSet);

  // ── Feed-error detection loop ──────────────────────────────────────────────

  for (const platformId of Object.keys(config.platforms)) {
    const platform = config.platforms[platformId];
    const ingestionStatus = await getJson<ProviderIngestionStatus | null>(
      env.PSM_STATE,
      `ingestion:provider:${platformId}`,
      null,
    );

    if (!ingestionStatus) continue;

    // Check for 24+ hours of staleness + an error recorded on the last poll.
    const lastOkAt = ingestionStatus.lastOkAt ?? null;
    const hasError = Boolean(ingestionStatus.lastError);

    if (!hasError) continue;

    // If lastOkAt is not set, fall back to checkedAt as a conservative baseline
    // — this means we don't fire until we see a confirmed error with known last-ok time.
    if (!lastOkAt) continue;

    const staleDurationMs = Date.parse(checkedAt) - Date.parse(lastOkAt);
    if (staleDurationMs < FEED_ERROR_THRESHOLD_MS) continue;

    // Feed has been failing for 24+ hours — check dedup.
    const feedErrorKey = `tg:sent:feedError:${platformId}`;
    const existingFeedError = await getJson<{ sentAt: string } | null>(
      env.PSM_STATE,
      feedErrorKey,
      null,
    );
    if (existingFeedError) continue;

    // Format and send feed-error notification.
    const lastOkMYT = formatMYT(new Date(lastOkAt));
    const text = [
      `⚠️ [FEED ERROR] ${platform.displayName} RSS — failing for 24+ hours`,
      `Last successful: ${lastOkMYT}`,
      platform.statusPageUrl ? `→ ${platform.statusPageUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const feedRecord = await sendTelegramMessage(
      env,
      token,
      chatId,
      topicId,
      `feedError:${platformId}`,
      "feed_error",
      text,
    );

    // Write dedup key on success, with 1-day TTL so it re-fires daily while broken.
    if (feedRecord.ok) {
      await putJson(
        env.PSM_STATE,
        feedErrorKey,
        { sentAt: checkedAt },
        { expirationTtl: TTL_FEED_ERROR_DEDUP },
      );
    }

    records.push(feedRecord);
  }

  return records;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatTelegramMessage(
  config: InstallConfig,
  incident: Incident,
  matchedDependents: string[],
  activeDependents: string[],
  outsideHoursDependents: string[],
): string {
  const icon = resolveIcon(incident);
  const type = resolveType(incident);
  const platform =
    config.platforms[incident.platform]?.displayName ?? incident.platform;

  const clientsLine = matchedDependents
    .map((id) => {
      const displayName =
        config.dependents[id]?.displayName ?? id;
      const label = activeDependents.includes(id)
        ? "(active)"
        : "(outside hours)";
      return `${displayName} ${label}`;
    })
    .join(", ");

  const lines = [
    `${icon} [${type}] ${platform} — ${incident.title}`,
    `Severity: ${incident.severity.toUpperCase()}`,
    `Clients: ${clientsLine}`,
    `Updated: ${incident.updatedAt}`,
  ];

  if (incident.sourceUrl) {
    lines.push(`→ ${incident.sourceUrl}`);
  }

  return lines.join("\n");
}

function resolveIcon(incident: Incident): string {
  if (incident.status === "resolved") return "✅";
  if (incident.severity === "critical" || incident.severity === "major") return "🔴";
  // synthetic_down surfaces as a resolved=null, status=investigating incident
  // from the synthetic provider. The severity is already set to "major" by that
  // provider, so the major branch above handles it. No additional check needed.
  return "🟡";
}

function resolveType(incident: Incident): string {
  if (incident.status === "resolved") return "RESOLVED";
  if (incident.severity === "critical" || incident.severity === "major") return "OUTAGE";
  return "MINOR";
}

/** Format a UTC date as MYT (UTC+8) ISO-like string for feed-error messages. */
function formatMYT(date: Date): string {
  return date.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " MYT";
}

// ─── Telegram API delivery ────────────────────────────────────────────────────

async function sendTelegramMessage(
  env: Env,
  token: string,
  chatId: string,
  topicId: string | undefined,
  incidentId: string,
  status: string,
  text: string,
): Promise<TelegramDeliveryRecord> {
  const deliveredAt = new Date().toISOString();
  const base = { incidentId, status, deliveredAt };

  let responseBody = "";
  let httpCode: number | null = null;

  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    };
    if (topicId) {
      payload.message_thread_id = Number(topicId);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    httpCode = response.status;
    responseBody = (await response.text()).slice(0, 500);

    if (response.ok) {
      return { ...base, ok: true, message: "telegram delivered" };
    }

    // Non-2xx handling.
    let errorMessage: string;

    if (response.status === 429) {
      let retryAfter: number | null = null;
      try {
        const parsed = JSON.parse(responseBody) as { parameters?: { retry_after?: number } };
        retryAfter = parsed.parameters?.retry_after ?? null;
      } catch {
        // ignore parse error
      }
      const retryNote = retryAfter !== null ? ` (retry_after=${retryAfter}s)` : "";
      errorMessage = `rate-limited${retryNote}`;
      console.warn(`[tg-notifier] 429 rate limited for incident ${incidentId}${retryNote}`);
    } else if (response.status === 403) {
      errorMessage = "forbidden — token may be revoked";
      console.error(`[tg-notifier] 403 forbidden for incident ${incidentId} — check TELEGRAM_BOT_TOKEN`);
    } else {
      errorMessage = `http ${response.status}`;
      console.error(`[tg-notifier] ${response.status} error for incident ${incidentId}: ${responseBody}`);
    }

    await writeTgErrorLast(env, { ts: deliveredAt, incidentId, status, httpCode, body: responseBody });
    return { ...base, ok: false, message: errorMessage };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown error";
    console.error(`[tg-notifier] network error for incident ${incidentId}: ${errMsg}`);
    await writeTgErrorLast(env, { ts: deliveredAt, incidentId, status, httpCode: null, body: errMsg });
    return { ...base, ok: false, message: "network error" };
  }
}

async function writeTgErrorLast(env: Env, record: TgErrorRecord): Promise<void> {
  try {
    await putJson(env.PSM_STATE, "tg:error:last", record);
  } catch {
    // Best-effort — don't let error-logging failures surface to the caller.
    console.error("[tg-notifier] failed to write tg:error:last to KV");
  }
}
