import type { InstallConfig } from "./config-schema";
import type { Incident, RoutingDecision } from "./incident";

function intersects(left: string[], right: string[]): boolean {
  return left.includes("global") || right.includes("global") || left.some((value) => right.includes(value));
}

function dependentMatchesIncident(config: InstallConfig, dependentId: string, incident: Incident): string[] {
  const dependent = config.dependents[dependentId];
  const reasons: string[] = [];

  for (const dependency of dependent.dependencies) {
    if (dependency.platform !== incident.platform) continue;
    if (dependency.services.length > 0 && incident.services.length > 0 && !intersects(dependency.services, incident.services)) continue;
    if (dependency.zones.length > 0 && incident.zones.length > 0 && !intersects(dependency.zones, incident.zones)) continue;
    reasons.push(`platform matched dependent ${dependentId}: ${incident.platform}`);
  }

  return reasons;
}

function ruleMatches(rule: InstallConfig["routingRules"][number], incident: Incident, dependentIds: string[]): boolean {
  const match = rule.match;
  if (match.dependents && !intersects(match.dependents, dependentIds)) return false;
  if (match.platforms && !match.platforms.includes(incident.platform)) return false;
  if (match.services && !intersects(match.services, incident.services)) return false;
  if (match.zones && !intersects(match.zones, incident.zones)) return false;
  if (match.severities && !match.severities.includes(incident.severity)) return false;
  if (match.statuses && !match.statuses.includes(incident.status)) return false;
  return true;
}

export function routeIncident(config: InstallConfig, incident: Incident): RoutingDecision {
  const reason: string[] = [];
  const matchedDependents = Object.keys(config.dependents).filter((dependentId) => {
    const reasons = dependentMatchesIncident(config, dependentId, incident);
    reason.push(...reasons);
    return reasons.length > 0;
  });

  if (matchedDependents.length === 0) {
    return {
      incidentId: incident.id,
      decision: "suppress_irrelevant",
      venues: [],
      matchedDependents: [],
      matchedRules: [],
      reason: ["no dependent dependency matched incident"],
      createdAt: new Date().toISOString()
    };
  }

  const matchedRules = config.routingRules.filter((rule) => ruleMatches(rule, incident, matchedDependents));
  matchedRules.forEach((rule) => reason.push(`routing rule matched: ${rule.id}`));

  if (matchedRules.length === 0) {
    return {
      incidentId: incident.id,
      decision: "suppress_irrelevant",
      venues: [],
      matchedDependents,
      matchedRules: [],
      reason: [...reason, "no routing rule matched incident"],
      createdAt: new Date().toISOString()
    };
  }

  const venues = [...new Set(matchedRules.flatMap((rule) => rule.actions.map((action) => action.venue)))];

  return {
    incidentId: incident.id,
    decision: "visible",
    venues,
    matchedDependents,
    matchedRules: matchedRules.map((rule) => rule.id),
    reason,
    createdAt: new Date().toISOString()
  };
}

