import type { InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import type { Incident } from "@platform-status-monitor/shared";

const workerBaseUrl = process.env.NEXT_PUBLIC_WORKER_BASE_URL ?? "http://localhost:8787";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  checkedAt?: string;
}

export async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${workerBaseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getValidation(): Promise<ValidationResult> {
  return fetchJson<ValidationResult>("/api/validation", { valid: false, issues: ["Worker unavailable"] });
}

export async function getRecentIncidents(): Promise<Incident[]> {
  const data = await fetchJson<{ incidents: Incident[] }>("/api/incidents/recent", { incidents: [] });
  return data.incidents;
}

export async function getRecentDecisions(): Promise<RoutingDecision[]> {
  const data = await fetchJson<{ decisions: RoutingDecision[] }>("/api/decisions/recent", { decisions: [] });
  return data.decisions;
}

export async function getConfig(): Promise<InstallConfig | null> {
  return fetchJson<InstallConfig | null>("/api/config", null);
}

