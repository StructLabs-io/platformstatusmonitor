import { describe, expect, it } from "vitest";
import { installConfigSchema, validateInstallConfig } from "../src/index";

describe("installConfigSchema", () => {
  it("accepts a minimal valid install config", () => {
    const result = installConfigSchema.safeParse({
      name: "Example",
      platforms: {
        airtable: {
          displayName: "Airtable",
          ingestion: ["rss"],
          services: { interfaces: { displayName: "Interfaces" } }
        }
      },
      dependents: {
        example: {
          type: "client",
          displayName: "Example Client",
          timezone: "America/New_York",
          activeHours: { start: "09:00", end: "18:00" },
          dependencies: [{ platform: "airtable", services: ["interfaces"], zones: ["global"] }]
        }
      },
      venues: {
        webapp: { type: "webapp", displayName: "Webapp Only" }
      },
      routingRules: [
        {
          id: "visible-major",
          match: { severities: ["major", "critical"] },
          actions: [{ venue: "webapp" }]
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("returns useful validation issues for missing venue references", () => {
    const issues = validateInstallConfig({
      name: "Broken",
      platforms: {},
      dependents: {},
      venues: {},
      routingRules: [{ id: "broken", match: {}, actions: [{ venue: "missing" }] }]
    });

    expect(issues).toContain("routingRules[0].actions[0].venue references unknown venue: missing");
  });
});

