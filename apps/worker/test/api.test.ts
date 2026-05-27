import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const env = {
  PSM_STATE: {
    async get(key: string) {
      if (key === "index:incidents:recent") return JSON.stringify([]);
      if (key === "index:decisions:recent") return JSON.stringify([]);
      if (key === "validation:latest") return JSON.stringify({ valid: true, issues: [] });
      return null;
    },
    async put() {},
    async delete() {},
    async list() {
      return { keys: [], list_complete: true, cursor: undefined };
    }
  }
} as unknown as Env;

describe("worker api", () => {
  it("responds to health checks", async () => {
    const response = await worker.fetch(new Request("https://example.com/health"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "platform-status-monitor" });
  });

  it("returns recent incidents", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/incidents/recent"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ incidents: [] });
  });
});

