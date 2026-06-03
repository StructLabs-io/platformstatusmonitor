import type { Incident, InstallConfig } from "@platform-status-monitor/shared";
import {
  inferServices,
  inferZones,
  normalizeImpact,
  normalizeStatus,
  sourceIncidentUrl,
} from "./common";
import { assertAllowedProviderUrl, safeFetchText } from "./fetch";

export interface StatuspageIncident {
  id: string;
  name: string;
  status: string;
  impact: string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string | null;
  shortlink?: string | null;
  incident_updates?: Array<{
    body?: string;
    display_at?: string;
    created_at?: string;
    status?: string;
  }>;
  components?: Array<{ name?: string; status?: string }>;
}

export async function fetchStatuspageIncidents(
  config: InstallConfig,
  platformId: string,
): Promise<Incident[]> {
  const apiUrl = statuspageIncidentsUrl(config, platformId);
  if (!apiUrl) return [];

  const { response, text } = await safeFetchText(apiUrl, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);

  const data = JSON.parse(text) as {
    incidents?: StatuspageIncident[];
  };
  return (data.incidents ?? [])
    .map((incident) =>
      normalizeStatuspageIncident(config, platformId, incident),
    )
    .filter((incident): incident is Incident => Boolean(incident))
    .filter(
      (incident) =>
        incident.resolvedAt === null &&
        incident.status !== "resolved" &&
        incident.status !== "postmortem",
    );
}

export function canPollStatuspage(
  config: InstallConfig,
  platformId: string,
): boolean {
  const platform = config.platforms[platformId];
  return Boolean(
    platform?.statusPageUrl &&
    platform.ingestion.includes("rss") &&
    (!platform.providerType || platform.providerType === "statuspage"),
  );
}

function statuspageIncidentsUrl(
  config: InstallConfig,
  platformId: string,
): string | null {
  const platform = config.platforms[platformId];
  if (!platform.statusPageUrl) return null;
  try {
    const url = new URL(platform.statusPageUrl);
    assertAllowedProviderUrl(url.toString());
    if (
      url.hostname.includes("google.com") &&
      url.pathname.includes("appsstatus")
    )
      return null;
    return `${url.origin}/api/v2/incidents.json`;
  } catch {
    return null;
  }
}

function normalizeStatuspageIncident(
  config: InstallConfig,
  platformId: string,
  incident: StatuspageIncident,
): Incident | null {
  if (!incident.id || !incident.name) return null;
  const latestUpdate = incident.incident_updates?.[0];
  const status = normalizeStatus(incident.status);
  const updatedAt =
    incident.updated_at ??
    latestUpdate?.display_at ??
    latestUpdate?.created_at ??
    new Date().toISOString();
  const startedAt = incident.created_at ?? updatedAt;
  const sourceUrl =
    sourceIncidentUrl(
      config.platforms[platformId]?.statusPageUrl,
      incident.id,
    ) ||
    incident.shortlink ||
    config.platforms[platformId]?.statusPageUrl ||
    "";
  const text = `${incident.name} ${latestUpdate?.body ?? ""} ${(incident.components ?? []).map((component) => component.name ?? "").join(" ")}`;

  return {
    id: `${platformId}:${incident.id}`,
    source: "rss",
    platform: platformId,
    services: inferServices(config, platformId, text),
    zones: inferZones(config, platformId, text),
    severity: normalizeImpact(incident.impact),
    status,
    title: incident.name,
    summary: latestUpdate?.body ?? incident.name,
    startedAt,
    updatedAt,
    resolvedAt:
      status === "resolved" || status === "postmortem"
        ? (incident.resolved_at ?? updatedAt)
        : null,
    sourceUrl,
    providerStatus:
      status === "resolved" || status === "postmortem" ? "resolved" : "active",
    raw: incident,
  };
}
