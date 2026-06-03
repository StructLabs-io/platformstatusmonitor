import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const state = new Map<string, string>([
  ["index:incidents:recent", JSON.stringify([])],
  ["index:decisions:recent", JSON.stringify([])],
  ["validation:latest", JSON.stringify({ valid: true, issues: [] })],
]);

const env = {
  PSM_ADMIN_TOKEN: "test-token",
  PSM_READ_TOKEN: "read-token",
  PSM_STATE: {
    async get(key: string) {
      return state.get(key) ?? null;
    },
    async put(key: string, value: string) {
      state.set(key, value);
    },
    async delete() {},
    async list() {
      return { keys: [], list_complete: true, cursor: undefined };
    },
  },
} as unknown as Env;

describe("worker api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    state.clear();
    state.set("index:incidents:recent", JSON.stringify([]));
    state.set("index:decisions:recent", JSON.stringify([]));
    state.set("validation:latest", JSON.stringify({ valid: true, issues: [] }));
  });

  it("responds to health checks", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/health"),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "platform-status-monitor",
    });
  });

  it("returns recent incidents", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/incidents/recent", {
        headers: { authorization: "Bearer read-token" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ incidents: [] });
  });

  it("protects manual refresh", async () => {
    const unauthorized = await worker.fetch(
      new Request("https://example.com/api/admin/refresh", { method: "POST" }),
      env,
    );
    expect(unauthorized.status).toBe(401);
  });

  it("protects read endpoints", async () => {
    const unauthorized = await worker.fetch(
      new Request("https://example.com/api/config"),
      env,
    );
    expect(unauthorized.status).toBe(401);
  });

  it("ingests statuspage incidents during scheduled runs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          incidents: [
            {
              id: "inc_1",
              name: "Airtable Interfaces degraded",
              status: "investigating",
              impact: "minor",
              created_at: "2026-05-27T10:00:00Z",
              updated_at: "2026-05-27T10:05:00Z",
              shortlink: "https://status.airtable.com/incidents/inc_1",
              incident_updates: [
                {
                  body: "Interfaces are slow.",
                  display_at: "2026-05-27T10:05:00Z",
                },
              ],
              components: [
                { name: "Interfaces", status: "degraded_performance" },
              ],
            },
          ],
        }),
      ),
    );

    await worker.scheduled({} as ScheduledEvent, env);

    const response = await worker.fetch(
      new Request("https://example.com/api/incidents/recent", {
        headers: { authorization: "Bearer read-token" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      incidents: Array<{
        platform: string;
        services: string[];
        status: string;
      }>;
    };
    expect(body.incidents).toContainEqual(
      expect.objectContaining({
        platform: "airtable",
        services: ["interfaces"],
        status: "investigating",
      }),
    );
  });
});
