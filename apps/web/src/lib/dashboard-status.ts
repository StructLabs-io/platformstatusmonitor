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

export interface PlatformTier {
  id: string;
  displayName: string;
  description: string | null;
  platforms: PlatformHealth[];
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

function zonesOverlap(dependencyZones: string[], incidentZones: string[]): boolean {
  if (incidentZones.includes("global")) return true;
  return dependencyZones.some((zone) => zone !== "global" && incidentZones.includes(zone));
}

function inferImpactedDependents(config: InstallConfig, incident: Incident): string[] {
  return Object.values(config.dependents)
    .filter((dependent) =>
      dependent.dependencies.some((dependency) => {
        if (dependency.platform !== incident.platform) return false;
        if (dependency.services.length > 0 && incident.services.length > 0 && !overlaps(dependency.services, incident.services)) return false;
        if (dependency.zones.length > 0 && incident.zones.length > 0 && !zonesOverlap(dependency.zones, incident.zones)) return false;
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
  const hasDecisions = decisions.length > 0;
  const relevantIncidentIds = new Set(
    decisions.filter((decision) => decision.decision === "visible" || decision.decision === "notify").map((decision) => decision.incidentId)
  );

  return Object.entries(config.platforms).map(([id, platform]) => {
    const incident =
      activeIncidents
        .filter((item) => item.platform === id && (!hasDecisions || relevantIncidentIds.has(item.id)))
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

function fallbackTierNames(): string[] {
  return ["Tier 1", "Tier 2", "Tier 3"];
}

/**
 * The "Owned Properties" section data returned by buildOwnedPropertiesSection.
 * `tiers` will be empty when no tier-0 is configured.
 * When there is exactly one tier-0 group, callers should render it flat (no tier sub-headers).
 * When there are multiple groups, callers may render tier sub-headers for each.
 */
export interface OwnedPropertiesSection {
  platforms: PlatformHealth[];
  tiers: PlatformTier[];
}

/**
 * Returns the Owned Properties section — platforms assigned to any tier whose ID
 * starts with "tier-0". Returns empty arrays if no tier-0 is configured.
 * Used to render Owned Properties as a top-level section above Monitored Platforms.
 */
export function buildOwnedPropertiesSection(config: InstallConfig, health: PlatformHealth[]): OwnedPropertiesSection {
  const byId = new Map(health.map((platform) => [platform.id, platform]));
  const ownedTierConfigs = (config.dashboard?.tiers ?? []).filter((t) => t.id === "tier-0" || t.id.startsWith("tier-0-"));

  if (ownedTierConfigs.length === 0) {
    return { platforms: [], tiers: [] };
  }

  const tiers: PlatformTier[] = ownedTierConfigs.map((tier) => ({
    id: tier.id,
    displayName: tier.displayName,
    description: tier.description ?? null,
    platforms: tier.platforms.flatMap((platformId) => {
      const platform = byId.get(platformId);
      return platform ? [platform] : [];
    })
  }));

  const platforms = tiers.flatMap((t) => t.platforms);
  return { platforms, tiers };
}

/**
 * Builds monitored-platform tiers, excluding any platforms already claimed by the
 * Owned Properties section (tier-0 / tier-0-*).
 */
export function buildPlatformTiers(config: InstallConfig, health: PlatformHealth[]): PlatformTier[] {
  const byId = new Map(health.map((platform) => [platform.id, platform]));
  const configuredTiers = config.dashboard?.tiers ?? [];

  if (configuredTiers.length > 0) {
    const used = new Set<string>();
    // Collect all platform IDs belonging to owned-properties tiers so they are
    // excluded from the Monitored Platforms section.
    const ownedPlatformIds = new Set(
      configuredTiers
        .filter((t) => t.id === "tier-0" || t.id.startsWith("tier-0-"))
        .flatMap((t) => t.platforms)
    );
    const monitoredTierConfigs = configuredTiers.filter(
      (t) => t.id !== "tier-0" && !t.id.startsWith("tier-0-")
    );
    const tiers = monitoredTierConfigs.map((tier) => {
      const platforms = tier.platforms.flatMap((platformId) => {
        const platform = byId.get(platformId);
        if (!platform) return [];
        used.add(platformId);
        return [platform];
      });

      return {
        id: tier.id,
        displayName: tier.displayName,
        description: tier.description ?? null,
        platforms
      };
    });
    // Remaining = configured but not placed in any monitored tier, and not owned
    const remaining = health.filter((platform) => !used.has(platform.id) && !ownedPlatformIds.has(platform.id));
    return remaining.length > 0
      ? [...tiers, { id: "uncategorized", displayName: "Uncategorized", description: "Configured platforms not assigned to a tier.", platforms: remaining }]
      : tiers;
  }

  const names = fallbackTierNames();
  const tierSize = Math.ceil(health.length / names.length);
  return names.map((displayName, index) => ({
    id: `tier-${index + 1}`,
    displayName,
    description: null,
    platforms: health.slice(index * tierSize, (index + 1) * tierSize)
  }));
}

export function formatIncidentScope(config: InstallConfig, incident: Incident): string {
  const platform = config.platforms[incident.platform];
  const services = incident.services.map((service) => platform?.services[service]?.displayName ?? service);
  const zones = incident.zones.filter((zone) => zone !== "global");
  return [...services, ...zones].join(" / ");
}

/**
 * Returns the display name of the owned (internal-system) entity from config, if any.
 * This is the entity named explicitly in the impact line; all other impacted dependents
 * are collapsed to a count to avoid leaking client names.
 */
export function getOwnedEntityName(config: InstallConfig): string | null {
  const owned = Object.values(config.dependents).find((d) => d.type === "internal-system");
  return owned?.displayName ?? null;
}

/**
 * Formats the impact line for a platform.
 *
 * Rules:
 * - If the owned entity is affected, name it first, then "and N client(s)" for the rest.
 *   If N === 0, omit the "and N clients" suffix.
 * - If the owned entity is NOT affected, just "N client(s)" (no name).
 * - Singular: "1 client", plural: "N clients".
 *
 * Examples (owned = "StructLabs.io"):
 *   ["StructLabs.io", "ANI", "OV", "HH", "UWDS"] → "StructLabs.io and 4 clients"
 *   ["StructLabs.io", "ANI", "OV"]                → "StructLabs.io and 2 clients"
 *   ["StructLabs.io", "ANI"]                       → "StructLabs.io and 1 client"
 *   ["StructLabs.io"]                              → "StructLabs.io"
 *   ["ANI", "OV", "HH"]                            → "3 clients"
 *   ["ANI"]                                        → "1 client"
 */
export function formatImpactLine(platformName: string, impactedDependents: string[], ownedEntityName: string | null): string {
  const ownedAffected = ownedEntityName !== null && impactedDependents.includes(ownedEntityName);
  const clientCount = ownedAffected ? impactedDependents.length - 1 : impactedDependents.length;
  const clientLabel = clientCount === 1 ? "1 client" : `${clientCount} clients`;

  let impactPhrase: string;
  if (ownedAffected) {
    impactPhrase = clientCount > 0 ? `${ownedEntityName} and ${clientLabel}` : ownedEntityName;
  } else {
    impactPhrase = clientLabel;
  }

  return `${platformName} is impacting ${impactPhrase}.`;
}
