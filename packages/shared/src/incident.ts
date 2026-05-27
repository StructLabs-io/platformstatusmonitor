import type { z } from "zod";
import type { severitySchema, statusSchema } from "./config-schema";

export type IncidentSeverity = z.infer<typeof severitySchema>;
export type IncidentStatus = z.infer<typeof statusSchema>;
export type IncidentSource = "rss" | "webhook" | "synthetic";

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

