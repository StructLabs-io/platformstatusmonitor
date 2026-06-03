import { describe, expect, it } from "vitest";
import type { Incident, InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import { buildOwnedPropertiesSection, buildPlatformHealth, buildPlatformTiers, formatIncidentScope, formatImpactLine, getOwnedEntityName } from "./dashboard-status";

const config: InstallConfig = {
  name: "Test",
  platforms: {
    airtable: {
      displayName: "Airtable",
      statusPageUrl: "https://status.airtable.com",
      ingestion: ["rss"],
      services: { interfaces: { displayName: "Interfaces" } },
      zones: ["global", "us"]
    },
    make: {
      displayName: "Make",
      statusPageUrl: "https://status.make.com",
      ingestion: ["rss"],
      services: { webhooks: { displayName: "Webhooks" } },
      zones: ["global"]
    }
  },
  dependents: {
    client: {
      type: "client",
      displayName: "Client",
      timezone: "America/New_York",
      dependencies: [{ platform: "airtable", services: ["interfaces"], zones: ["us"], criticality: "high", environment: "production" }]
    }
  },
  venues: {
    webapp: { type: "webapp", displayName: "Webapp Only" }
  },
  routingRules: []
};

const incident: Incident = {
  id: "incident-1",
  source: "rss",
  platform: "airtable",
  services: ["interfaces"],
  zones: ["us"],
  severity: "major",
  status: "identified",
  title: "Interfaces degraded",
  summary: "",
  startedAt: "2026-05-27T10:00:00Z",
  updatedAt: "2026-05-27T10:10:00Z",
  resolvedAt: null,
  sourceUrl: "https://status.airtable.com/incidents/1",
  raw: {}
};

describe("getOwnedEntityName", () => {
  it("returns the displayName of the internal-system dependent", () => {
    const cfg = {
      ...config,
      dependents: {
        ...config.dependents,
        structlabs: {
          type: "internal-system" as const,
          displayName: "StructLabs.io",
          timezone: "Asia/Kuala_Lumpur",
          dependencies: []
        }
      }
    };
    expect(getOwnedEntityName(cfg)).toBe("StructLabs.io");
  });

  it("returns null when no internal-system dependent exists", () => {
    expect(getOwnedEntityName(config)).toBeNull();
  });
});

describe("formatImpactLine", () => {
  const owned = "StructLabs.io";

  it("names owned + count when owned and multiple clients affected", () => {
    expect(formatImpactLine("Cloudflare", [owned, "ANI", "OV", "HH", "UWDS"], owned))
      .toBe("Cloudflare is impacting StructLabs.io and 4 clients.");
  });

  it("names owned + 2 clients", () => {
    expect(formatImpactLine("Cloudflare", [owned, "ANI", "OV"], owned))
      .toBe("Cloudflare is impacting StructLabs.io and 2 clients.");
  });

  it("names owned + 1 client (singular)", () => {
    expect(formatImpactLine("Cloudflare", [owned, "ANI"], owned))
      .toBe("Cloudflare is impacting StructLabs.io and 1 client.");
  });

  it("names owned only — omits client count when no other clients", () => {
    expect(formatImpactLine("Cloudflare", [owned], owned))
      .toBe("Cloudflare is impacting StructLabs.io.");
  });

  it("uses client count when owned is not affected, multiple clients", () => {
    expect(formatImpactLine("Cloudflare", ["ANI", "OV", "HH"], owned))
      .toBe("Cloudflare is impacting 3 clients.");
  });

  it("uses singular client when owned not affected and only 1 client", () => {
    expect(formatImpactLine("Cloudflare", ["ANI"], owned))
      .toBe("Cloudflare is impacting 1 client.");
  });

  it("behaves correctly when no owned entity configured (null)", () => {
    expect(formatImpactLine("Cloudflare", ["ANI", "OV"], null))
      .toBe("Cloudflare is impacting 2 clients.");
  });

  it("behaves correctly when owned not configured and only 1 dependent", () => {
    expect(formatImpactLine("Cloudflare", ["ANI"], null))
      .toBe("Cloudflare is impacting 1 client.");
  });
});

describe("buildPlatformHealth", () => {
  it("keeps platform order and marks active incident platforms", () => {
    const decisions: RoutingDecision[] = [
      {
        incidentId: "incident-1",
        decision: "visible",
        venues: ["webapp"],
        matchedDependents: ["client"],
        matchedRules: ["major"],
        reason: [],
        createdAt: "2026-05-27T10:11:00Z"
      }
    ];

    const health = buildPlatformHealth(config, [incident], decisions);

    expect(health.map((platform) => platform.id)).toEqual(["airtable", "make"]);
    expect(health[0]).toMatchObject({ level: "bad", impactedDependents: ["Client"] });
    expect(health[1]).toMatchObject({ level: "ok", incident: null });
  });

  it("formats services and zones without long incident text", () => {
    expect(formatIncidentScope(config, incident)).toBe("Interfaces / us");
  });

  it("groups platforms by configured tiers", () => {
    const health = buildPlatformHealth(
      {
        ...config,
        dashboard: {
          tiers: [
            { id: "core", displayName: "Core", platforms: ["make"] },
            { id: "client", displayName: "Client", platforms: ["airtable"] },
            { id: "supporting", displayName: "Supporting", platforms: [] }
          ]
        }
      },
      [incident],
      []
    );

    const tiers = buildPlatformTiers({ ...config, dashboard: { tiers: [{ id: "core", displayName: "Core", platforms: ["make"] }] } }, health);

    expect(tiers[0].displayName).toBe("Core");
    expect(tiers[0].platforms.map((platform) => platform.id)).toEqual(["make"]);
    expect(tiers[1].displayName).toBe("Uncategorized");
    expect(tiers[1].platforms.map((platform) => platform.id)).toEqual(["airtable"]);
  });
});

describe("buildOwnedPropertiesSection", () => {
  const configWithTier0: InstallConfig = {
    ...config,
    platforms: {
      ...config.platforms,
      "my-site": {
        displayName: "My Site",
        ingestion: ["synthetic"] as ["synthetic"],
        services: {},
        zones: ["global"]
      }
    },
    dashboard: {
      tiers: [
        { id: "tier-0", displayName: "Owned Properties", platforms: ["my-site"] },
        { id: "tier-1", displayName: "Tier 1", platforms: ["airtable", "make"] }
      ]
    }
  };

  it("returns owned platforms from tier-0", () => {
    const health = buildPlatformHealth(configWithTier0, [], []);
    const section = buildOwnedPropertiesSection(configWithTier0, health);
    expect(section.platforms.map((p) => p.id)).toEqual(["my-site"]);
    expect(section.tiers).toHaveLength(1);
  });

  it("returns empty when no tier-0 exists", () => {
    const health = buildPlatformHealth(config, [], []);
    const section = buildOwnedPropertiesSection(config, health);
    expect(section.platforms).toHaveLength(0);
    expect(section.tiers).toHaveLength(0);
  });

  it("buildPlatformTiers excludes tier-0 platforms", () => {
    const health = buildPlatformHealth(configWithTier0, [], []);
    const tiers = buildPlatformTiers(configWithTier0, health);
    const allIds = tiers.flatMap((t) => t.platforms.map((p) => p.id));
    expect(allIds).not.toContain("my-site");
    expect(allIds).toContain("airtable");
    expect(allIds).toContain("make");
  });
});
