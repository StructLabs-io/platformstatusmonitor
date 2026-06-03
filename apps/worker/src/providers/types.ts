import type { Incident, InstallConfig } from "@platform-status-monitor/shared";

export type ProviderConfidence = "high" | "medium" | "low" | "manual";

export interface ProviderIngestionStatus {
  platform: string;
  checkedAt: string;
  ok: boolean;
  activeIncidentCount: number;
  providerType: string;
  confidence: ProviderConfidence;
  lastError: string | null;
}

export interface ProviderResult {
  incidents: Incident[];
  status: ProviderIngestionStatus;
}

export interface ProviderAdapterContext {
  checkedAt: string;
  config: InstallConfig;
  platformId: string;
}
