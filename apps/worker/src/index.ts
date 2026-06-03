import {
  routeIncident,
  validateInstallConfig,
  type Incident,
  type InstallConfig,
  type RoutingDecision,
} from "@platform-status-monitor/shared";
import installConfig from "../../../config/install.json";
import { incidentFingerprint } from "./providers/common";
import { pollPlatform, type ProviderIngestionStatus } from "./providers";
import { getJson, putJson, putJsonIfChanged, type Env } from "./state/kv-state";

const bundledConfig = installConfig as InstallConfig;

// Emitted once per cold start, after env is available on first request.
let coldStartLogged = false;

function logColdStart(env: Env): void {
  if (coldStartLogged) return;
  coldStartLogged = true;
  console.log(
    `[PSM worker] boot version=${env.PSM_VERSION ?? "0.1.0"} build=${env.PSM_BUILD_NUMBER ?? "0"} sha=${env.PSM_GIT_SHA ?? "unknown"}`,
  );
}

interface IngestionResult {
  checkedAt: string;
  providerCount: number;
  activeIncidentCount: number;
  decisionCount: number;
  errors: string[];
  persisted: boolean;
  persistenceErrors: string[];
}

interface DeliveryRecord {
  id: string;
  incidentId: string;
  venue: string;
  ok: boolean;
  deliveredAt: string;
  message: string;
}

interface RuntimeSnapshot {
  incidents: Incident[];
  decisions: RoutingDecision[];
  providers: ProviderIngestionStatus[];
  deliveries: DeliveryRecord[];
  validation: ReturnType<typeof validateBundledConfig>;
  updatedAt: string;
}

const SNAPSHOT_KEY = "snapshot:latest";
const INGESTION_KEY = "ingestion:latest";
const HOT_PLATFORM_IDS = ["slack", "xero"];
const ROTATING_PLATFORM_BATCH_SIZE = 1;
const INCIDENT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const EMPTY_SNAPSHOT: RuntimeSnapshot = {
  incidents: [],
  decisions: [],
  providers: [],
  deliveries: [],
  validation: { valid: true, issues: [], checkedAt: "" },
  updatedAt: "",
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin":
        init.headers instanceof Headers
          ? (init.headers.get("access-control-allow-origin") ?? "null")
          : "null",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...init.headers,
    },
  });
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  logColdStart(env);

  if (request.method === "OPTIONS") {
    const cors = corsHeaders(request, env);
    return new Response(null, {
      status: cors.allowed ? 204 : 403,
      headers: cors.headers,
    });
  }

  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  const responseHeaders = cors.headers;

  if (url.pathname === "/health") {
    return json(
      {
        ok: true,
        service: "platform-status-monitor",
        version: env.PSM_VERSION ?? "0.1.0",
        buildNumber: Number(env.PSM_BUILD_NUMBER ?? "0"),
        sha: env.PSM_GIT_SHA ?? "unknown",
        ts: new Date().toISOString(),
      },
      { headers: responseHeaders },
    );
  }

  if (!cors.allowed) {
    return json(
      { error: "origin not allowed" },
      { status: 403, headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/public/dashboard") {
    return json(await publicDashboardSnapshot(env), {
      headers: responseHeaders,
    });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (!isAuthorizedAdminRequest(request, env)) {
      return json(
        { error: "unauthorized" },
        { status: 401, headers: responseHeaders },
      );
    }
  } else if (
    url.pathname.startsWith("/api/") &&
    !isAuthorizedReadRequest(request, env)
  ) {
    return json(
      { error: "unauthorized" },
      { status: 401, headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/incidents/recent") {
    const snapshot = await loadRuntimeSnapshot(env);
    return json(
      { incidents: snapshot.incidents },
      { headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/decisions/recent") {
    const snapshot = await loadRuntimeSnapshot(env);
    return json(
      { decisions: snapshot.decisions },
      { headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/validation") {
    const snapshot = await loadRuntimeSnapshot(env);
    return json(
      snapshot.validation.valid || snapshot.validation.issues.length > 0
        ? snapshot.validation
        : validateBundledConfig(),
      {
        headers: responseHeaders,
      },
    );
  }

  if (url.pathname === "/api/ingestion/latest") {
    return json(
      await getJson<IngestionResult | null>(env.PSM_STATE, INGESTION_KEY, null),
      { headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/ingestion/providers") {
    const snapshot = await loadRuntimeSnapshot(env);
    return json(
      { providers: snapshot.providers },
      { headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/deliveries/recent") {
    const snapshot = await loadRuntimeSnapshot(env);
    return json(
      { deliveries: snapshot.deliveries },
      { headers: responseHeaders },
    );
  }

  if (url.pathname === "/api/admin/refresh") {
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, { status: 405 });
    }
    return json(await runIngestion(env, bundledConfig), {
      headers: responseHeaders,
    });
  }

  if (url.pathname === "/api/admin/test-notification") {
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, { status: 405 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      venue?: string;
      message?: string;
    };
    return json(await sendTestNotification(env, bundledConfig, body), {
      headers: responseHeaders,
    });
  }

  if (url.pathname === "/api/config") {
    return json(bundledConfig, { headers: responseHeaders });
  }

  return json(
    { error: "not found" },
    { status: 404, headers: responseHeaders },
  );
}

export default {
  fetch: handleFetch,
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runIngestion(env, bundledConfig).catch(() => undefined);
  },
};

export type { Env };

function validateBundledConfig() {
  const issues = validateInstallConfig(bundledConfig);
  return {
    valid: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

function isAuthorizedAdminRequest(request: Request, env: Env): boolean {
  if (!env.PSM_ADMIN_TOKEN) return false;
  return (
    request.headers.get("authorization") === `Bearer ${env.PSM_ADMIN_TOKEN}`
  );
}

function isAuthorizedReadRequest(request: Request, env: Env): boolean {
  if (env.PSM_PUBLIC_READS === "true") return true;
  const authorization = request.headers.get("authorization");
  return Boolean(
    (env.PSM_READ_TOKEN && authorization === `Bearer ${env.PSM_READ_TOKEN}`) ||
    (env.PSM_ADMIN_TOKEN && authorization === `Bearer ${env.PSM_ADMIN_TOKEN}`),
  );
}

function corsHeaders(
  request: Request,
  env: Env,
): { allowed: boolean; headers: HeadersInit } {
  const origin = request.headers.get("origin");
  const allowedOrigins = (env.PSM_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origin) {
    return {
      allowed: true,
      headers: {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
        vary: "Origin",
      },
    };
  }

  const allowed =
    allowedOrigins.length === 0
      ? env.PSM_PUBLIC_READS === "true"
      : allowedOrigins.includes(origin);

  return {
    allowed,
    headers: {
      "access-control-allow-origin": allowed ? origin : "null",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  };
}

async function publicDashboardSnapshot(env: Env) {
  const snapshot = await loadRuntimeSnapshot(env);

  return {
    config: {
      name: bundledConfig.name,
      timezone: bundledConfig.timezone,
      dashboard: bundledConfig.dashboard,
      platforms: Object.fromEntries(
        Object.entries(bundledConfig.platforms).map(([id, platform]) => [
          id,
          {
            displayName: platform.displayName,
            statusPageUrl: platform.statusPageUrl,
            ingestion: platform.ingestion,
            providerType: platform.providerType,
            services: platform.services,
            zones: platform.zones,
          },
        ]),
      ),
    },
    incidents: snapshot.incidents.map((incident) => ({
      id: incident.id,
      source: incident.source,
      platform: incident.platform,
      services: incident.services,
      zones: incident.zones,
      severity: incident.severity,
      status: incident.status,
      title: incident.title,
      summary: incident.summary,
      startedAt: incident.startedAt,
      updatedAt: incident.updatedAt,
      resolvedAt: incident.resolvedAt,
      sourceUrl: incident.sourceUrl,
      firstSeenAt: incident.firstSeenAt,
      lastSeenAt: incident.lastSeenAt,
      lastChangedAt: incident.lastChangedAt,
      providerStatus: incident.providerStatus,
    })),
    providers: snapshot.providers,
  };
}

async function runIngestion(
  env: Env,
  config: InstallConfig,
): Promise<IngestionResult> {
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  const activeIncidents: Incident[] = [];
  const providerStatuses: ProviderIngestionStatus[] = [];
  const previousSnapshot = await loadRuntimeSnapshot(env);
  const platformsToPoll = selectPlatformsToPoll(config, checkedAt);
  const polledPlatformIds = new Set(platformsToPoll);
  const previousIncidents = new Map(
    previousSnapshot.incidents.map((incident) => [incident.id, incident]),
  );

  for (const platformId of platformsToPoll) {
    const result = await pollPlatform(config, platformId, checkedAt);
    activeIncidents.push(...result.incidents);
    providerStatuses.push(result.status);
    if (result.status.lastError) {
      errors.push(`${platformId}: ${result.status.lastError}`);
    }
  }

  const incidentsWithLifecycle = await Promise.all(
    activeIncidents.map((incident) =>
      applyLifecycle(
        previousIncidents.get(incident.id) ?? null,
        incident,
        checkedAt,
      ),
    ),
  );
  const sortedIncidents = incidentsWithLifecycle
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, 100);
  const mergedIncidents = mergeIncidents(
    previousSnapshot.incidents,
    sortedIncidents,
    polledPlatformIds,
    checkedAt,
  );
  const decisions = mergedIncidents.map((incident) =>
    routeIncident(config, incident),
  );
  const deliveryDecisions = sortedIncidents.map((incident) =>
    routeIncident(config, incident),
  );
  const deliveries = await deliverDecisions(
    env,
    config,
    sortedIncidents,
    deliveryDecisions,
  );

  const result = {
    checkedAt,
    providerCount: Object.keys(config.platforms).length,
    activeIncidentCount: mergedIncidents.length,
    decisionCount: decisions.length,
    errors,
    persisted: true,
    persistenceErrors: [] as string[],
  };

  const persistence = await persistIngestionResult(
    env,
    mergedIncidents,
    decisions,
    deliveries,
    providerStatuses,
    result,
    previousSnapshot,
  );
  result.persisted = persistence.persisted;
  result.persistenceErrors = persistence.persistenceErrors;

  return result;
}

async function persistIngestionResult(
  env: Env,
  incidents: Incident[],
  decisions: RoutingDecision[],
  deliveries: DeliveryRecord[],
  providerStatuses: ProviderIngestionStatus[],
  result: IngestionResult,
  previousSnapshot: RuntimeSnapshot,
): Promise<{ persisted: boolean; persistenceErrors: string[] }> {
  const nextSnapshot: RuntimeSnapshot = {
    incidents,
    decisions,
    providers: mergeProviderStatuses(
      previousSnapshot.providers,
      providerStatuses,
    ),
    deliveries: [...deliveries, ...previousSnapshot.deliveries].slice(0, 100),
    validation: validateBundledConfig(),
    updatedAt: result.checkedAt,
  };

  const persistenceErrors: string[] = [];
  try {
    if (materialSnapshotChanged(previousSnapshot, nextSnapshot)) {
      await putJson(env.PSM_STATE, SNAPSHOT_KEY, nextSnapshot);
    }
  } catch (error) {
    persistenceErrors.push(redactPersistenceError(error));
  }

  if (persistenceErrors.length === 0) {
    try {
      await putJsonIfChanged(env.PSM_STATE, INGESTION_KEY, result);
    } catch (error) {
      persistenceErrors.push(redactPersistenceError(error));
    }
  }

  const persisted = persistenceErrors.length === 0;
  return { persisted, persistenceErrors: [...new Set(persistenceErrors)] };
}

function redactPersistenceError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "state persistence failed";
  if (message.toLowerCase().includes("kv put() limit"))
    return "state write quota exceeded";
  return "state persistence failed";
}

function selectPlatformsToPoll(
  config: InstallConfig,
  checkedAt: string,
): string[] {
  const allPlatformIds = Object.keys(config.platforms);
  const hotPlatformIds = HOT_PLATFORM_IDS.filter((id) =>
    allPlatformIds.includes(id),
  );
  const rotatingPlatformIds = allPlatformIds.filter(
    (id) => !hotPlatformIds.includes(id),
  );
  if (rotatingPlatformIds.length === 0) return hotPlatformIds;

  const slot = Math.floor(Date.parse(checkedAt) / (5 * 60 * 1000));
  const start = slot % rotatingPlatformIds.length;
  const rotatingBatch = Array.from(
    {
      length: Math.min(
        ROTATING_PLATFORM_BATCH_SIZE,
        rotatingPlatformIds.length,
      ),
    },
    (_, offset) =>
      rotatingPlatformIds[(start + offset) % rotatingPlatformIds.length],
  );

  return [...new Set([...hotPlatformIds, ...rotatingBatch])];
}

function mergeIncidents(
  previous: Incident[],
  latest: Incident[],
  polledPlatformIds: Set<string>,
  checkedAt: string,
): Incident[] {
  const latestById = new Map(latest.map((incident) => [incident.id, incident]));
  const checkedAtMs = Date.parse(checkedAt);

  for (const incident of previous) {
    if (latestById.has(incident.id)) continue;
    if (polledPlatformIds.has(incident.platform)) continue;
    if (!isIncidentFreshEnough(incident, checkedAtMs)) continue;
    latestById.set(incident.id, incident);
  }

  return Array.from(latestById.values())
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, 100);
}

function isIncidentFreshEnough(
  incident: Incident,
  checkedAtMs: number,
): boolean {
  const lastSeenAt = incident.lastSeenAt ?? incident.updatedAt;
  const lastSeenAtMs = Date.parse(lastSeenAt);
  return Number.isFinite(lastSeenAtMs)
    ? checkedAtMs - lastSeenAtMs < INCIDENT_STALE_AFTER_MS
    : false;
}

async function applyLifecycle(
  previous: Incident | null,
  incident: Incident,
  checkedAt: string,
): Promise<Incident> {
  const fingerprint = incidentFingerprint(incident);
  return {
    ...incident,
    fingerprint,
    firstSeenAt: previous?.firstSeenAt ?? checkedAt,
    lastSeenAt: checkedAt,
    lastChangedAt:
      previous?.fingerprint === fingerprint
        ? (previous.lastChangedAt ?? previous.updatedAt)
        : checkedAt,
    providerStatus:
      incident.resolvedAt ||
      incident.status === "resolved" ||
      incident.status === "postmortem"
        ? "resolved"
        : "active",
  };
}

async function loadRuntimeSnapshot(env: Env): Promise<RuntimeSnapshot> {
  const snapshot = await getJson<RuntimeSnapshot | null>(
    env.PSM_STATE,
    SNAPSHOT_KEY,
    null,
  );
  // If the consolidated snapshot key is absent (cold start or failed prior tick),
  // return an empty baseline. The legacy per-key fallback path was removed because
  // reading N individual incident/decision/provider/delivery keys on every missed
  // snapshot caused a KV read cascade → CPU overrun → exceededResources → feedback
  // loop on subsequent ticks.
  return snapshot ?? { ...EMPTY_SNAPSHOT };
}

function mergeProviderStatuses(
  previous: ProviderIngestionStatus[],
  latest: ProviderIngestionStatus[],
): ProviderIngestionStatus[] {
  const byPlatform = new Map(
    previous.map((status) => [status.platform, status]),
  );
  for (const status of latest) byPlatform.set(status.platform, status);
  return Array.from(byPlatform.values()).sort((left, right) =>
    left.platform.localeCompare(right.platform),
  );
}

function materialSnapshotChanged(
  previous: RuntimeSnapshot,
  next: RuntimeSnapshot,
): boolean {
  return (
    materialSnapshotSignature(previous) !== materialSnapshotSignature(next)
  );
}

function materialSnapshotSignature(snapshot: RuntimeSnapshot): string {
  return JSON.stringify({
    incidents: snapshot.incidents.map((incident) => ({
      ...incident,
      firstSeenAt: undefined,
      lastSeenAt: undefined,
      lastChangedAt: undefined,
      raw: undefined,
    })),
    decisions: snapshot.decisions,
    providers: snapshot.providers.map((provider) => ({
      ...provider,
      checkedAt: undefined,
    })),
    deliveries: snapshot.deliveries,
    validation: {
      valid: snapshot.validation.valid,
      issues: snapshot.validation.issues,
    },
  });
}

async function deliverDecisions(
  env: Env,
  config: InstallConfig,
  incidents: Incident[],
  decisions: RoutingDecision[],
): Promise<DeliveryRecord[]> {
  const incidentById = new Map(
    incidents.map((incident) => [incident.id, incident]),
  );
  const records: DeliveryRecord[] = [];

  for (const decision of decisions) {
    if (decision.decision !== "visible" && decision.decision !== "notify")
      continue;
    const incident = incidentById.get(decision.incidentId);
    if (!incident) continue;

    for (const venueId of decision.venues) {
      const venue = config.venues[venueId];
      if (!venue || venue.type === "webapp") continue;

      const fingerprintKey = `delivery:fingerprint:${incident.id}:${venueId}:${incident.status}`;
      const existing = await getJson<DeliveryRecord | null>(
        env.PSM_STATE,
        fingerprintKey,
        null,
      );
      if (existing) {
        records.push({
          ...existing,
          message: `duplicate suppressed for ${venueId}`,
        });
        continue;
      }

      const record = await sendVenueNotification(
        env,
        config,
        venueId,
        incident,
        decision,
      );
      await putJson(env.PSM_STATE, fingerprintKey, record).catch(
        () => undefined,
      );
      records.push(record);
    }
  }

  return records.slice(0, 100);
}

async function sendTestNotification(
  env: Env,
  config: InstallConfig,
  body: { venue?: string; message?: string },
): Promise<DeliveryRecord> {
  const venue =
    body.venue ??
    Object.keys(config.venues).find(
      (id) => config.venues[id]?.type !== "webapp",
    );
  if (!venue) {
    return {
      id: `test:${Date.now()}`,
      incidentId: "test",
      venue: "none",
      ok: false,
      deliveredAt: new Date().toISOString(),
      message: "no external notification venue configured",
    };
  }

  const incident: Incident = {
    id: `test:${Date.now()}`,
    source: "synthetic",
    platform: "test",
    services: [],
    zones: ["global"],
    severity: "info",
    status: "identified",
    title: body.message ?? "Platform Status Monitor test notification",
    summary: body.message ?? "Platform Status Monitor test notification",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    sourceUrl: "",
    raw: {},
  };
  const decision: RoutingDecision = {
    incidentId: incident.id,
    decision: "notify",
    venues: [venue],
    matchedDependents: [],
    matchedRules: ["admin-test"],
    reason: ["admin test notification"],
    createdAt: new Date().toISOString(),
  };
  const record = await sendVenueNotification(
    env,
    config,
    venue,
    incident,
    decision,
  );
  const recent = await getJson<string[]>(
    env.PSM_STATE,
    "index:deliveries:recent",
    [],
  );
  await Promise.allSettled([
    putJson(env.PSM_STATE, `delivery:${record.id}`, record),
    putJson(
      env.PSM_STATE,
      "index:deliveries:recent",
      [record.id, ...recent].slice(0, 100),
    ),
  ]);
  return record;
}

async function sendVenueNotification(
  env: Env,
  config: InstallConfig,
  venueId: string,
  incident: Incident,
  decision: RoutingDecision,
): Promise<DeliveryRecord> {
  const venue = config.venues[venueId];
  const deliveredAt = new Date().toISOString();
  const recordBase = {
    id: `${incident.id}:${venueId}:${Date.now()}`,
    incidentId: incident.id,
    venue: venueId,
    deliveredAt,
  };

  try {
    if (venue?.type === "telegram") {
      const token = envSecret(env, venue.botTokenSecret);
      const chatId = envSecret(env, venue.chatIdEnv);
      if (!token || !chatId)
        throw new Error("telegram token or chat id missing");
      const topicId = venue.topicIdEnv
        ? envSecret(env, venue.topicIdEnv)
        : undefined;
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_thread_id: topicId ? Number(topicId) : undefined,
            text: formatNotification(config, incident, decision),
            disable_web_page_preview: true,
          }),
        },
      );
      if (!response.ok) throw new Error(`telegram ${response.status}`);
      return { ...recordBase, ok: true, message: "telegram delivered" };
    }

    if (venue?.type === "slack") {
      const webhookUrl = envSecret(env, venue.webhookUrlEnv);
      if (!webhookUrl) throw new Error("slack webhook url missing");
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: formatNotification(config, incident, decision),
        }),
      });
      if (!response.ok) throw new Error(`slack ${response.status}`);
      return { ...recordBase, ok: true, message: "slack delivered" };
    }

    return { ...recordBase, ok: false, message: "unsupported venue" };
  } catch (error) {
    return {
      ...recordBase,
      ok: false,
      message: error instanceof Error ? error.message : "delivery failed",
    };
  }
}

function envSecret(env: Env, key: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatNotification(
  config: InstallConfig,
  incident: Incident,
  decision: RoutingDecision,
): string {
  const platform =
    config.platforms[incident.platform]?.displayName ?? incident.platform;
  const dependents = decision.matchedDependents
    .map(
      (dependentId) =>
        config.dependents[dependentId]?.displayName ?? dependentId,
    )
    .join(", ");
  return [
    `[${incident.severity.toUpperCase()}] ${platform}: ${incident.title}`,
    `Status: ${incident.status}`,
    `Scope: ${[...incident.services, ...incident.zones].join(", ") || "global"}`,
    dependents ? `Impacted: ${dependents}` : null,
    incident.sourceUrl || null,
  ]
    .filter(Boolean)
    .join("\n");
}
