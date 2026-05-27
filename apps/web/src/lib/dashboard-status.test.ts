import { describe, expect, it } from "vitest";
import type { Incident, InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import { buildPlatformHealth, formatIncidentScope } from "./dashboard-status";

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
});
