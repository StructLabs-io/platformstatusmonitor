import type { InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import type { Incident } from "@platform-status-monitor/shared";
import {
  demoConfig,
  demoDecisions,
  demoDeliveries,
  demoIncidents,
  demoProviders,
  demoValidation,
} from "./demo-data";

const workerBaseUrl = process.env.NEXT_PUBLIC_WORKER_BASE_URL ?? "http://localhost:8787";
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const readToken = process.env.NEXT_PUBLIC_READ_TOKEN;

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  checkedAt?: string;
}

export interface ProviderIngestionStatus {
  platform: string;
  checkedAt: string;
  ok: boolean;
  activeIncidentCount: number;
  providerType?: string;
  confidence?: "high" | "medium" | "low" | "manual";
  lastError: string | null;
}

export interface DeliveryRecord {
  id: string;
  incidentId: string;
  venue: string;
  ok: boolean;
  deliveredAt: string;
  message: string;
}

export async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${workerBaseUrl}${path}`, {
      cache: "no-store",
      headers: readToken ? { authorization: `Bearer ${readToken}` } : undefined,
    });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getValidation(): Promise<ValidationResult> {
  if (demoMode) return demoValidation;
  return fetchJson<ValidationResult>("/api/validation", { valid: false, issues: ["Worker unavailable"] });
}

export async function getRecentIncidents(): Promise<Incident[]> {
  if (demoMode) return demoIncidents;
  const data = await fetchJson<{ incidents: Incident[] }>("/api/incidents/recent", { incidents: [] });
  return data.incidents;
}

export async function getRecentDecisions(): Promise<RoutingDecision[]> {
  if (demoMode) return demoDecisions;
  const data = await fetchJson<{ decisions: RoutingDecision[] }>("/api/decisions/recent", { decisions: [] });
  return data.decisions;
}

export async function getConfig(): Promise<InstallConfig | null> {
  if (demoMode) return demoConfig;
  return fetchJson<InstallConfig | null>("/api/config", null);
}

export async function getProviderIngestionStatuses(): Promise<ProviderIngestionStatus[]> {
  if (demoMode) return demoProviders;
  const data = await fetchJson<{ providers: ProviderIngestionStatus[] }>("/api/ingestion/providers", { providers: [] });
  return data.providers;
}

export async function getRecentDeliveries(): Promise<DeliveryRecord[]> {
  if (demoMode) return demoDeliveries;
  const data = await fetchJson<{ deliveries: DeliveryRecord[] }>("/api/deliveries/recent", { deliveries: [] });
  return data.deliveries;
}
