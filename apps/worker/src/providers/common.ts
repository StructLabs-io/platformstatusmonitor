import type { Incident, InstallConfig } from "@platform-status-monitor/shared";
import type { ProviderConfidence } from "./types";

const regionAliases: Array<{ zone: string; patterns: RegExp[] }> = [
  { zone: "br", patterns: [/\bbrazil\b/i, /\bbrasil\b/i, /\bs[aã]o paulo\b/i] },
  { zone: "us", patterns: [/\bUS\b/, /\bUSA\b/i, /\bUnited States\b/i, /\bNorth America\b/i] },
  { zone: "eu", patterns: [/\bEU\b/, /\bEurope\b/i, /\bEuropean Union\b/i] },
  { zone: "au", patterns: [/\bAustralia\b/i, /\bSydney\b/i] },
  { zone: "asia", patterns: [/\bAsia\b/i, /\bAPAC\b/i] },
  { zone: "sgp1", patterns: [/\bSingapore\b/i, /\bSGP1\b/i] },
  { zone: "global", patterns: [/\bglobal\b/i, /\ball regions\b/i, /\ball customers\b/i, /\bworldwide\b/i] },
];

export function inferServices(
  config: InstallConfig,
  platformId: string,
  text: string,
): string[] {
  const platform = config.platforms[platformId];
  if (!platform) return [];

  const normalizedText = normalizeToken(text);
  return Object.entries(platform.services)
    .filter(([serviceId, service]) => {
      const candidates = [serviceId, service.displayName].map(normalizeToken);
      return candidates.some(
        (candidate) =>
          candidate.length > 0 && normalizedText.includes(candidate),
      );
    })
    .map(([serviceId]) => serviceId);
}

export function inferZones(
  config: InstallConfig,
  platformId: string,
  text: string,
): string[] {
  const platform = config.platforms[platformId];
  const zones = new Set<string>();
  const knownZones = platform?.zones ?? [];

  for (const zone of knownZones) {
    if (zone === "global") continue;
    if (zoneMatchesText(zone, text)) zones.add(zone);
  }

  for (const alias of regionAliases) {
    if (alias.patterns.some((pattern) => pattern.test(text))) {
      zones.add(alias.zone);
    }
  }

  if (zones.has("global")) return ["global"];
  return zones.size > 0 ? [...zones] : ["global"];
}

export function normalizeImpact(impact: string): Incident["severity"] {
  if (impact === "critical") return "critical";
  if (impact === "major") return "major";
  if (impact === "minor") return "minor";
  if (impact === "maintenance") return "maintenance";
  return "info";
}

export function normalizeStatus(status: string): Incident["status"] {
  if (
    status === "investigating" ||
    status === "identified" ||
    status === "monitoring" ||
    status === "resolved" ||
    status === "postmortem"
  )
    return status;
  if (status === "scheduled") return "identified";
  if (status === "in_progress" || status === "verifying") return "monitoring";
  if (status === "completed") return "resolved";
  return "investigating";
}

export function sourceIncidentUrl(
  statusPageUrl: string | undefined,
  incidentId: string,
): string {
  if (!statusPageUrl) return "";
  try {
    return `${new URL(statusPageUrl).origin}/incidents/${incidentId}`;
  } catch {
    return statusPageUrl;
  }
}

export function confidenceForProvider(
  config: InstallConfig,
  platformId: string,
): ProviderConfidence {
  const platform = config.platforms[platformId];
  if (!platform) return "manual";
  if (platform.ingestion.includes("webhook")) return "high";
  if (platform.providerType === "statuspage" || !platform.providerType) return "high";
  if (platform.providerType === "rss" || platform.providerType === "incidentio" || platform.providerType === "instatus") return "medium";
  if (platform.ingestion.includes("synthetic")) return "low";
  return "manual";
}

export function xmlValue(item: string, tagName: string): string {
  const match = item.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return decodeXml(match?.[1] ?? "").trim();
}

export function hashId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function incidentFingerprint(incident: Incident): string {
  return [
    incident.platform,
    incident.status,
    incident.severity,
    incident.title,
    incident.services.join(","),
    incident.zones.join(","),
  ].join("|");
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function zoneMatchesText(zone: string, text: string): boolean {
  const escaped = zone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (zone === "us") return /\bUS\b|\bUSA\b|\bUnited States\b/i.test(text);
  if (zone === "eu") return /\bEU\b|\bEurope\b/i.test(text);
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
