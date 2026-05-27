import type { Incident, InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";

export type PlatformStatusLevel = "ok" | "warn" | "bad";

export interface PlatformHealth {
  id: string;
  displayName: string;
  statusPageUrl: string | null;
  level: PlatformStatusLevel;
  incident: Incident | null;
  impactedDependents: string[];
}

const severityRank: Record<Incident["severity"], number> = {
  critical: 5,
  major: 4,
  minor: 3,
  maintenance: 2,
  info: 1
};

function isActiveIncident(incident: Incident): boolean {
  return incident.resolvedAt === null && incident.status !== "resolved" && incident.status !== "postmortem";
}

function statusLevelForIncident(incident: Incident | null): PlatformStatusLevel {
  if (!incident) return "ok";
  if (incident.severity === "critical" || incident.severity === "major") return "bad";
  return "warn";
}

function incidentSortValue(incident: Incident): number {
  return severityRank[incident.severity] * 1_000_000_000_000 + Date.parse(incident.updatedAt);
}

function overlaps(left: string[], right: string[]): boolean {
  return left.includes("global") || right.includes("global") || left.some((value) => right.includes(value));
}

function inferImpactedDependents(config: InstallConfig, incident: Incident): string[] {
  return Object.values(config.dependents)
    .filter((dependent) =>
      dependent.dependencies.some((dependency) => {
        if (dependency.platform !== incident.platform) return false;
        if (dependency.services.length > 0 && incident.services.length > 0 && !overlaps(dependency.services, incident.services)) return false;
        if (dependency.zones.length > 0 && incident.zones.length > 0 && !overlaps(dependency.zones, incident.zones)) return false;
        return true;
      })
    )
    .map((dependent) => dependent.displayName);
}

function decisionImpacts(config: InstallConfig, decisions: RoutingDecision[], incidentId: string): string[] {
  const names = decisions
    .filter((decision) => decision.incidentId === incidentId && (decision.decision === "visible" || decision.decision === "notify"))
    .flatMap((decision) => decision.matchedDependents)
    .map((dependentId) => config.dependents[dependentId]?.displayName)
    .filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

export function buildPlatformHealth(config: InstallConfig, incidents: Incident[], decisions: RoutingDecision[]): PlatformHealth[] {
  const activeIncidents = incidents.filter(isActiveIncident);

  return Object.entries(config.platforms).map(([id, platform]) => {
    const incident =
      activeIncidents
        .filter((item) => item.platform === id)
        .sort((left, right) => incidentSortValue(right) - incidentSortValue(left))[0] ?? null;
    const decisionDependents = incident ? decisionImpacts(config, decisions, incident.id) : [];
    const impactedDependents = incident ? (decisionDependents.length > 0 ? decisionDependents : inferImpactedDependents(config, incident)) : [];

    return {
      id,
      displayName: platform.displayName,
      statusPageUrl: platform.statusPageUrl ?? null,
      level: statusLevelForIncident(incident),
      incident,
      impactedDependents
    };
  });
}

export function formatIncidentScope(config: InstallConfig, incident: Incident): string {
  const platform = config.platforms[incident.platform];
  const services = incident.services.map((service) => platform?.services[service]?.displayName ?? service);
  const zones = incident.zones.filter((zone) => zone !== "global");
  return [...services, ...zones].join(" / ");
}
