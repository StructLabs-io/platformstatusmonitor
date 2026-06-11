import type { z } from "zod";
import type { severitySchema, statusSchema } from "./config-schema";
import type { SilenceReason } from "./notification-filter";

export type IncidentSeverity = z.infer<typeof severitySchema>;
export type IncidentStatus = z.infer<typeof statusSchema>;
export type IncidentSource = "rss" | "webhook" | "synthetic";

export interface IncidentNotificationStatus {
  telegram: { silenced: boolean; reason?: SilenceReason } | null;
}

export interface Incident {
  id: string;
  source: IncidentSource;
  platform: string;
  services: string[];
  zones: string[];
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  summary: string;
  startedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  sourceUrl: string;
  fingerprint?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastChangedAt?: string;
  providerStatus?: "active" | "resolved" | "unknown";
  /**
   * Presentational metadata attached by the API response handler — describes
   * which notification channels silenced this incident (e.g. Telegram filter
   * rules). Not produced by ingestion; not persisted in the snapshot. Used by
   * the dashboard to render a 🔕 badge.
   */
  silenced?: IncidentNotificationStatus;
  raw: unknown;
}

export interface RoutingDecision {
  incidentId: string;
  decision: "visible" | "suppress_duplicate" | "suppress_irrelevant" | "suppress_quiet_hours" | "digest" | "notify";
  venues: string[];
  matchedDependents: string[];
  matchedRules: string[];
  reason: string[];
  createdAt: string;
}
