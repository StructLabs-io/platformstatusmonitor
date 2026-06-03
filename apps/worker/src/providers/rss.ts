import type { Incident, InstallConfig } from "@platform-status-monitor/shared";
import { hashId, inferServices, inferZones, xmlValue } from "./common";
import { assertAllowedProviderUrl, safeFetchText } from "./fetch";

const activeTerms =
  /\b(investigating|identified|monitoring|degraded|degradation|outage|disruption|unavailable|issues?|trouble|impacting)\b/i;
const resolvedTerms =
  /\b(resolved|completed|postmortem|operating normally|operating as expected)\b/i;
const deescalatedTerms =
  /\b(not impacting the broader service|removed from the status page)\b/i;
const recentWindowMs = 36 * 60 * 60 * 1000;
const maxRecentItems = 25;

export async function fetchRssIncidents(
  config: InstallConfig,
  platformId: string,
): Promise<Incident[]> {
  const platform = config.platforms[platformId];
  const feedUrl = rssFeedUrl(config, platformId);
  if (!feedUrl) return [];
  const { response, text: xml } = await safeFetchText(feedUrl, {
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => match[0])
    .sort(
      (left, right) =>
        Date.parse(xmlValue(right, "pubDate")) -
        Date.parse(xmlValue(left, "pubDate")),
    )
    .slice(0, maxRecentItems);

  return items.flatMap((item, index) => {
    const title = xmlValue(item, "title");
    const description = xmlValue(item, "description");
    const text = `${title} ${description}`;
    if (
      !activeTerms.test(text) ||
      resolvedTerms.test(text) ||
      deescalatedTerms.test(text)
    )
      return [];
    const pubDate = xmlValue(item, "pubDate");
    const updatedAt = pubDate
      ? new Date(pubDate).toISOString()
      : new Date().toISOString();
    if (Date.now() - Date.parse(updatedAt) > recentWindowMs) return [];
    const id = xmlValue(item, "guid") || `${feedUrl}#${index}`;
    return [
      {
        id: `${platformId}:rss:${hashId(id)}`,
        source: "rss" as const,
        platform: platformId,
        services: inferServices(config, platformId, text),
        zones: inferZones(config, platformId, text),
        severity: /outage|unavailable/i.test(text) ? "major" : "minor",
        status: /monitoring/i.test(text)
          ? "monitoring"
          : /identified/i.test(text)
            ? "identified"
            : "investigating",
        title: title || `${platform.displayName} RSS incident`,
        summary: description || title,
        startedAt: updatedAt,
        updatedAt,
        resolvedAt: null,
        sourceUrl: xmlValue(item, "link") || platform.statusPageUrl || feedUrl,
        providerStatus: "active" as const,
        raw: item,
      },
    ];
  });
}

export function canPollRss(config: InstallConfig, platformId: string): boolean {
  const platform = config.platforms[platformId];
  return Boolean(
    platform?.ingestion.includes("rss") &&
    (platform.rssFeedUrl ||
      platform.providerType === "rss" ||
      platform.providerType === "incidentio" ||
      platform.providerType === "instatus"),
  );
}

function rssFeedUrl(config: InstallConfig, platformId: string): string | null {
  const platform = config.platforms[platformId];
  if (platform.rssFeedUrl) {
    assertAllowedProviderUrl(platform.rssFeedUrl);
    return platform.rssFeedUrl;
  }
  if (!platform.statusPageUrl) return null;
  try {
    const origin = new URL(platform.statusPageUrl).origin;
    assertAllowedProviderUrl(origin);
    if (platform.providerType === "instatus") return `${origin}/rss`;
    return `${origin}/history.rss`;
  } catch {
    return null;
  }
}
