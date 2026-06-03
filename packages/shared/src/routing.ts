import type { InstallConfig } from "./config-schema";
import type { Incident, RoutingDecision } from "./incident";

interface RouteIncidentOptions {
  now?: Date;
}

function intersects(left: string[], right: string[]): boolean {
  return left.includes("global") || right.includes("global") || left.some((value) => right.includes(value));
}

function zonesIntersect(dependencyZones: string[], incidentZones: string[]): boolean {
  if (incidentZones.includes("global")) return true;
  return dependencyZones.some((zone) => zone !== "global" && incidentZones.includes(zone));
}

function dependentMatchesIncident(config: InstallConfig, dependentId: string, incident: Incident): string[] {
  const dependent = config.dependents[dependentId];
  const reasons: string[] = [];

  for (const dependency of dependent.dependencies) {
    if (dependency.platform !== incident.platform) continue;
    if (dependency.services.length > 0 && incident.services.length > 0 && !intersects(dependency.services, incident.services)) continue;
    if (dependency.zones.length > 0 && incident.zones.length > 0 && !zonesIntersect(dependency.zones, incident.zones)) continue;
    reasons.push(`platform matched dependent ${dependentId}: ${incident.platform}`);
  }

  return reasons;
}

function ruleMatches(rule: InstallConfig["routingRules"][number], incident: Incident, dependentIds: string[]): boolean {
  const match = rule.match;
  if (match.dependents && !intersects(match.dependents, dependentIds)) return false;
  if (match.platforms && !match.platforms.includes(incident.platform)) return false;
  if (match.services && !intersects(match.services, incident.services)) return false;
  if (match.zones && !zonesIntersect(match.zones, incident.zones)) return false;
  if (match.severities && !match.severities.includes(incident.severity)) return false;
  if (match.statuses && !match.statuses.includes(incident.status)) return false;
  return true;
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function localMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isWithinWindow(minutes: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function isDependentActive(dependent: InstallConfig["dependents"][string], now: Date): boolean {
  if (!dependent.activeHours) return true;
  const minutes = localMinutes(now, dependent.timezone);
  return isWithinWindow(minutes, minutesFromTime(dependent.activeHours.start), minutesFromTime(dependent.activeHours.end));
}

export function routeIncident(config: InstallConfig, incident: Incident, options: RouteIncidentOptions = {}): RoutingDecision {
  const reason: string[] = [];
  const now = options.now ?? new Date();
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
  const bypassQuietHours = matchedRules.some((rule) => rule.options.bypassQuietHours || rule.options.respectActiveHours === false);
  const activeDependents = matchedDependents.filter((dependentId) => isDependentActive(config.dependents[dependentId], now));
  const outsideActiveHours = !bypassQuietHours && activeDependents.length === 0;
  const effectiveVenues = outsideActiveHours
    ? venues.filter((venue) => config.venues[venue]?.type === "webapp")
    : venues;

  if (outsideActiveHours && effectiveVenues.length === 0) {
    return {
      incidentId: incident.id,
      decision: "suppress_quiet_hours",
      venues: [],
      matchedDependents,
      matchedRules: matchedRules.map((rule) => rule.id),
      reason: [...reason, "all matched dependents are outside active hours"],
      createdAt: now.toISOString()
    };
  }

  return {
    incidentId: incident.id,
    decision: "visible",
    venues: effectiveVenues,
    matchedDependents,
    matchedRules: matchedRules.map((rule) => rule.id),
    reason: outsideActiveHours ? [...reason, "outside active hours; webapp visibility preserved"] : reason,
    createdAt: new Date().toISOString()
  };
}
