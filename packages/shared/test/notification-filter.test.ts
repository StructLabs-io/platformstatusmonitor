import { describe, expect, it } from "vitest";
import type { Incident } from "../src/incident";
import type { InstallConfig } from "../src/config-schema";
import { shouldSilenceTelegram } from "../src/notification-filter";

type Filters = NonNullable<InstallConfig["notificationFilters"]>;

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "test-1",
    source: "rss",
    platform: "cloudflare",
    services: ["workers"],
    zones: ["global"],
    severity: "major",
    status: "investigating",
    title: "Test",
    summary: "Test summary",
    startedAt: "2026-06-11T00:00:00Z",
    updatedAt: "2026-06-11T00:00:00Z",
    resolvedAt: null,
    sourceUrl: "https://example.com",
    raw: {},
    ...overrides,
  };
}

describe("shouldSilenceTelegram", () => {
  it("passes when no filters are configured (legacy behavior)", () => {
    const incident = makeIncident({ severity: "minor" });
    expect(shouldSilenceTelegram(incident, undefined)).toEqual({ silenced: false });
  });

  it("silences with severity-floor when severity is below floor", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {},
    };
    const incident = makeIncident({ severity: "minor" });
    expect(shouldSilenceTelegram(incident, filters)).toEqual({
      silenced: true,
      reason: "severity-floor",
    });
  });

  it("passes severity floor when severity is critical", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {},
    };
    const incident = makeIncident({ severity: "critical" });
    expect(shouldSilenceTelegram(incident, filters)).toEqual({ silenced: false });
  });

  it("treats empty severityFloor as 'allow all severities through the floor'", () => {
    const filters: Filters = { severityFloor: [], perPlatform: {} };
    expect(shouldSilenceTelegram(makeIncident({ severity: "info" }), filters)).toEqual({
      silenced: false,
    });
  });

  it("silences with platform-disabled when enabled is false", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: { cloudflare: { enabled: false } },
    };
    expect(shouldSilenceTelegram(makeIncident(), filters)).toEqual({
      silenced: true,
      reason: "platform-disabled",
    });
  });

  it("passes through when platform has no perPlatform entry", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: { airtable: { enabled: true, regionAllowlist: ["us"] } },
    };
    // cloudflare has no entry → pass through (only severity floor applies)
    expect(shouldSilenceTelegram(makeIncident(), filters)).toEqual({ silenced: false });
  });

  it("silences with component-not-allowed when allowlist excludes the service", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {
        cloudflare: { enabled: true, componentAllowlist: ["workers", "pages"] },
      },
    };
    const incident = makeIncident({ services: ["registrar"] });
    expect(shouldSilenceTelegram(incident, filters)).toEqual({
      silenced: true,
      reason: "component-not-allowed",
    });
  });

  it("passes when component allowlist intersects services", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {
        cloudflare: { enabled: true, componentAllowlist: ["workers", "pages"] },
      },
    };
    const incident = makeIncident({ services: ["workers", "stream"] });
    expect(shouldSilenceTelegram(incident, filters)).toEqual({ silenced: false });
  });

  it("silences with component-denied when denylist matches a service", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {
        cloudflare: { enabled: true, componentDenylist: ["registrar", "stream"] },
      },
    };
    const incident = makeIncident({ services: ["registrar"] });
    expect(shouldSilenceTelegram(incident, filters)).toEqual({
      silenced: true,
      reason: "component-denied",
    });
  });

  it("silences with region-not-allowed when zones do not intersect allowlist", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {
        cloudflare: {
          enabled: true,
          regionAllowlist: ["sin", "sgp", "iad"],
        },
      },
    };
    const incident = makeIncident({ zones: ["fra", "lhr"] });
    expect(shouldSilenceTelegram(incident, filters)).toEqual({
      silenced: true,
      reason: "region-not-allowed",
    });
  });

  it("passes when region allowlist intersects zones", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {
        cloudflare: { enabled: true, regionAllowlist: ["global", "sin"] },
      },
    };
    expect(shouldSilenceTelegram(makeIncident({ zones: ["global"] }), filters)).toEqual({
      silenced: false,
    });
  });

  it("evaluates severity floor before per-platform rules", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: { cloudflare: { enabled: false } },
    };
    const incident = makeIncident({ severity: "minor" });
    // Severity-floor wins even though platform is also disabled.
    expect(shouldSilenceTelegram(incident, filters)).toEqual({
      silenced: true,
      reason: "severity-floor",
    });
  });

  it("evaluates allowlist before denylist", () => {
    const filters: Filters = {
      severityFloor: ["critical", "major"],
      perPlatform: {
        cloudflare: {
          enabled: true,
          componentAllowlist: ["workers"],
          componentDenylist: ["workers"],
        },
      },
    };
    const incident = makeIncident({ services: ["cdn"] });
    // cdn fails the allowlist before the denylist is checked.
    expect(shouldSilenceTelegram(incident, filters)).toEqual({
      silenced: true,
      reason: "component-not-allowed",
    });
  });
});
