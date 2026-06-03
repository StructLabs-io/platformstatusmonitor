import { describe, expect, it } from "vitest";
import type { InstallConfig } from "../src/config-schema";
import type { Incident } from "../src/incident";
import { routeIncident } from "../src/routing";

const config: InstallConfig = {
  name: "Test",
  platforms: {
    airtable: {
      displayName: "Airtable",
      ingestion: ["rss"],
      services: { interfaces: { displayName: "Interfaces" } },
      zones: ["global", "us"]
    }
  },
  dependents: {
    client: {
      type: "client",
      displayName: "Client",
      timezone: "America/New_York",
      activeHours: { start: "09:00", end: "18:00" },
      dependencies: [{ platform: "airtable", services: ["interfaces"], zones: ["us"], criticality: "medium", environment: "production" }]
    }
  },
  venues: {
    webapp: { type: "webapp", displayName: "Webapp Only" }
  },
  routingRules: [
    {
      id: "major",
      match: { severities: ["major", "critical"] },
      actions: [{ venue: "webapp" }],
      options: { respectActiveHours: false, bypassQuietHours: false, notifyOnResolved: true }
    }
  ]
};

const incident: Incident = {
  id: "inc_1",
  source: "rss",
  platform: "airtable",
  services: ["interfaces"],
  zones: ["us"],
  severity: "major",
  status: "investigating",
  title: "Interfaces degraded",
  summary: "Airtable interfaces are degraded.",
  startedAt: "2026-05-27T12:00:00Z",
  updatedAt: "2026-05-27T12:00:00Z",
  resolvedAt: null,
  sourceUrl: "https://status.airtable.com/incidents/inc_1",
  raw: {}
};

describe("routeIncident", () => {
  it("marks matching incidents visible and explains why", () => {
    const decision = routeIncident(config, incident);

    expect(decision.decision).toBe("visible");
    expect(decision.venues).toEqual(["webapp"]);
    expect(decision.reason).toContain("platform matched dependent client: airtable");
    expect(decision.reason).toContain("routing rule matched: major");
  });

  it("suppresses irrelevant incidents", () => {
    const decision = routeIncident(config, { ...incident, platform: "make" });

    expect(decision.decision).toBe("suppress_irrelevant");
    expect(decision.venues).toEqual([]);
  });

  it("does not treat global dependencies as matching regional incidents", () => {
    const decision = routeIncident(config, {
      ...incident,
      zones: ["br"]
    });

    expect(decision.decision).toBe("suppress_irrelevant");
  });

  it("treats provider-global incidents as matching regional dependencies", () => {
    const decision = routeIncident(config, {
      ...incident,
      zones: ["global"]
    });

    expect(decision.decision).toBe("visible");
  });

  it("suppresses active-hour-aware rules outside dependent hours", () => {
    const quietConfig: InstallConfig = {
      ...config,
      venues: {
        ...config.venues,
        telegram: {
          type: "telegram",
          displayName: "Telegram",
          botTokenSecret: "TELEGRAM_BOT_TOKEN",
          chatIdEnv: "TELEGRAM_CHAT_ID"
        }
      },
      routingRules: [
        {
          id: "minor-active-hours",
          match: { severities: ["minor"] },
          actions: [{ venue: "telegram" }],
          options: { respectActiveHours: true, bypassQuietHours: false, notifyOnResolved: true }
        }
      ]
    };
    const decision = routeIncident(
      quietConfig,
      { ...incident, severity: "minor" },
      { now: new Date("2026-05-27T03:00:00Z") }
    );

    expect(decision.decision).toBe("suppress_quiet_hours");
  });

  it("keeps webapp visibility outside active hours", () => {
    const decision = routeIncident(
      {
        ...config,
        routingRules: [
          {
            id: "minor-active-hours",
            match: { severities: ["minor"] },
            actions: [{ venue: "webapp" }],
            options: { respectActiveHours: true, bypassQuietHours: false, notifyOnResolved: true }
          }
        ]
      },
      { ...incident, severity: "minor" },
      { now: new Date("2026-05-27T03:00:00Z") }
    );

    expect(decision.decision).toBe("visible");
    expect(decision.venues).toEqual(["webapp"]);
  });
});
