import type { Incident, InstallConfig } from "@platform-status-monitor/shared";
import { hashId } from "./common";
import { safeFetchResponse } from "./fetch";

export async function runSyntheticCheck(
  config: InstallConfig,
  platformId: string,
): Promise<Incident | null> {
  const platform = config.platforms[platformId];
  const checkUrl = platform.syntheticCheckUrl ?? platform.statusPageUrl;
  if (!checkUrl || !platform.ingestion.includes("synthetic")) return null;
  const checkedAt = new Date().toISOString();
  const response = await safeFetchResponse(checkUrl, { method: "GET" });
  if (response.ok) return null;
  return {
    id: `${platformId}:synthetic:${hashId(checkUrl)}`,
    source: "synthetic",
    platform: platformId,
    services: [],
    zones: ["global"],
    severity: response.status >= 500 ? "major" : "minor",
    status: "investigating",
    title: `${platform.displayName} synthetic check failed`,
    summary: `${checkUrl} returned ${response.status} ${response.statusText}`,
    startedAt: checkedAt,
    updatedAt: checkedAt,
    resolvedAt: null,
    sourceUrl: checkUrl,
    providerStatus: "active",
    raw: { status: response.status, statusText: response.statusText },
  };
}
