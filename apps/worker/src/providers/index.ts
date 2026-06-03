import type { Incident, InstallConfig } from "@platform-status-monitor/shared";
import { confidenceForProvider } from "./common";
import { canPollRss, fetchRssIncidents } from "./rss";
import { runSyntheticCheck } from "./synthetic";
import { canPollStatuspage, fetchStatuspageIncidents } from "./statuspage";
import type { ProviderIngestionStatus } from "./types";

export type { ProviderConfidence, ProviderIngestionStatus } from "./types";

export async function pollPlatform(
  config: InstallConfig,
  platformId: string,
  checkedAt: string,
): Promise<{ incidents: Incident[]; status: ProviderIngestionStatus }> {
  const platform = config.platforms[platformId];
  const incidents: Incident[] = [];

  try {
    const syntheticIncident = await runSyntheticCheck(config, platformId);
    if (syntheticIncident) incidents.push(syntheticIncident);

    if (canPollStatuspage(config, platformId)) {
      incidents.push(...(await fetchStatuspageIncidents(config, platformId)));
    } else if (canPollRss(config, platformId)) {
      incidents.push(...(await fetchRssIncidents(config, platformId)));
    }

    return {
      incidents,
      status: {
        platform: platformId,
        checkedAt,
        ok: true,
        activeIncidentCount: incidents.length,
        providerType: platform.providerType ?? (platform.ingestion.includes("synthetic") ? "synthetic" : "statuspage"),
        confidence: confidenceForProvider(config, platformId),
        lastError: null,
      },
    };
  } catch (error) {
    return {
      incidents: [],
      status: {
        platform: platformId,
        checkedAt,
        ok: false,
        activeIncidentCount: 0,
        providerType: platform.providerType ?? "statuspage",
        confidence: confidenceForProvider(config, platformId),
        lastError: error instanceof Error ? error.message : "unknown ingestion error",
      },
    };
  }
}
