import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstallConfig } from "@platform-status-monitor/shared";
import { notifyTelegram } from "../src/notifiers/telegram";
import type { Env } from "../src/index";

// ─── Shared test fixtures ────────────────────────────────────────────────────

const config: InstallConfig = {
  name: "Test",
  platforms: {
    airtable: {
      displayName: "Airtable",
      statusPageUrl: "https://status.airtable.com",
      providerType: "statuspage",
      ingestion: ["rss"],
      services: { api: { displayName: "API" } },
      zones: ["global"],
    },
    github: {
      displayName: "GitHub",
      statusPageUrl: "https://www.githubstatus.com",
      providerType: "statuspage",
      ingestion: ["rss"],
      services: {},
      zones: ["global"],
    },
  },
  dependents: {
    ov: {
      type: "client",
      displayName: "Omniventure",
      timezone: "America/Denver",
      activeHours: { start: "07:00", end: "20:00" },
      dependencies: [
        {
          platform: "airtable",
          services: ["api"],
          zones: ["global"],
          criticality: "high",
          environment: "production",
        },
        {
          platform: "github",
          services: [],
          zones: ["global"],
          criticality: "medium",
          environment: "production",
        },
      ],
    },
    ani: {
      type: "client",
      displayName: "ANI",
      timezone: "America/New_York",
      activeHours: { start: "09:00", end: "18:00" },
      dependencies: [
        {
          platform: "airtable",
          services: [],
          zones: ["global"],
          criticality: "medium",
          environment: "production",
        },
      ],
    },
  },
  venues: {
    webapp: { type: "webapp", displayName: "Webapp Only" },
    "telegram-ops": {
      type: "telegram",
      displayName: "Telegram Ops",
      botTokenSecret: "TELEGRAM_BOT_TOKEN",
      chatIdEnv: "TELEGRAM_CHAT_ID",
      topicIdEnv: "TELEGRAM_TOPIC_ID",
    },
  },
  routingRules: [
    {
      id: "show-critical",
      match: { severities: ["critical", "major"] },
      actions: [{ venue: "webapp" }],
      options: {
        respectActiveHours: false,
        bypassQuietHours: false,
        notifyOnResolved: true,
      },
    },
    {
      id: "show-minor",
      match: { severities: ["minor"] },
      actions: [{ venue: "webapp" }],
      options: {
        respectActiveHours: true,
        bypassQuietHours: false,
        notifyOnResolved: true,
      },
    },
  ],
};

const baseIncident = {
  id: "inc_1",
  source: "rss" as const,
  platform: "airtable",
  services: ["api"],
  zones: ["global"],
  severity: "minor" as const,
  status: "investigating" as const,
  title: "Airtable API degraded",
  summary: "API is slow.",
  startedAt: "2026-06-03T08:00:00Z",
  updatedAt: "2026-06-03T08:05:00Z",
  resolvedAt: null,
  sourceUrl: "https://status.airtable.com/incidents/inc_1",
  raw: {},
};

// ─── KV mock factory ─────────────────────────────────────────────────────────

function makeKv(initial: Map<string, string> = new Map()) {
  const store = new Map(initial);
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, _options?: unknown) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cursor: undefined };
    },
    _store: store,
  };
}

function makeEnv(kv: ReturnType<typeof makeKv>): Env {
  return {
    PSM_STATE: kv as unknown as KVNamespace,
    PSM_ADMIN_TOKEN: "test-admin",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_CHAT_ID: "-1002968612512",
    TELEGRAM_TOPIC_ID: "7825",
  };
}

// Checkin time during active hours for OV (America/Denver, 07:00–20:00) and ANI
// (America/New_York, 09:00–18:00). 2026-06-03T14:00:00Z = 08:00 Denver / 10:00 NY.
const CHECKED_AT_ACTIVE = "2026-06-03T14:00:00Z";

// Outside active hours for ANI (18:00 NY = 22:00 UTC), but OV is active.
const CHECKED_AT_OV_ACTIVE_ANI_INACTIVE = "2026-06-03T22:30:00Z";

// Both inactive: 03:00 UTC = 21:00 Denver (past 20:00), 23:00 NY (past 18:00).
const CHECKED_AT_ALL_INACTIVE = "2026-06-04T03:00:00Z";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("notifyTelegram", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips silently when TELEGRAM_BOT_TOKEN is absent", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    delete (env as Partial<Env>).TELEGRAM_BOT_TOKEN;

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

    expect(records).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delivers a minor incident when at least one dependent is active", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

    expect(records).toHaveLength(1);
    expect(records[0].ok).toBe(true);
    expect(records[0].incidentId).toBe("inc_1");
    expect(records[0].status).toBe("investigating");

    // Dedup key must be written.
    const dedupKey = kv._store.get("tg:sent:inc_1:investigating");
    expect(dedupKey).toBeTruthy();
  });

  it("formats message with active/outside-hours client labels", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    let capturedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedBody = typeof init.body === "string" ? init.body : "";
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    // At this time OV is active, ANI is outside hours.
    await notifyTelegram(env, config, [baseIncident], CHECKED_AT_OV_ACTIVE_ANI_INACTIVE);

    const payload = JSON.parse(capturedBody) as { text: string };
    expect(payload.text).toContain("🟡 [MINOR] Airtable — Airtable API degraded");
    expect(payload.text).toContain("Omniventure (active)");
    expect(payload.text).toContain("ANI (outside hours)");
    expect(payload.text).toContain("Severity: MINOR");
    expect(payload.text).toContain("→ https://status.airtable.com/incidents/inc_1");
  });

  it("suppresses a minor incident when all matched dependents are outside active hours", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ALL_INACTIVE);

    expect(records).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delivers a major incident regardless of active hours", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    const records = await notifyTelegram(
      env,
      config,
      [{ ...baseIncident, severity: "major" }],
      CHECKED_AT_ALL_INACTIVE,
    );

    expect(records).toHaveLength(1);
    expect(records[0].ok).toBe(true);
  });

  it("formats major incident as 🔴 [OUTAGE]", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    let capturedText = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { text: string };
        capturedText = body.text;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    await notifyTelegram(
      env,
      config,
      [{ ...baseIncident, severity: "major" }],
      CHECKED_AT_ALL_INACTIVE,
    );

    expect(capturedText).toContain("🔴 [OUTAGE]");
  });

  it("formats resolved incident as ✅ [RESOLVED]", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    let capturedText = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { text: string };
        capturedText = body.text;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    await notifyTelegram(
      env,
      config,
      [{ ...baseIncident, status: "resolved" }],
      CHECKED_AT_ACTIVE,
    );

    expect(capturedText).toContain("✅ [RESOLVED]");
  });

  it("skips when dedup key already exists", async () => {
    const dedupKey = "tg:sent:inc_1:investigating";
    const kv = makeKv(new Map([[dedupKey, JSON.stringify({ ok: true })]]));
    const env = makeEnv(kv);

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

    expect(records).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips incidents with no matched dependents", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    // docusign has no dependents in test config
    const records = await notifyTelegram(
      env,
      config,
      [{ ...baseIncident, platform: "docusign" }],
      CHECKED_AT_ACTIVE,
    );

    expect(records).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe("429 rate-limit handling", () => {
    it("does not write dedup key on 429 and returns ok=false", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 30 } }),
            { status: 429 },
          ),
        ),
      );

      const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(1);
      expect(records[0].ok).toBe(false);
      expect(records[0].message).toContain("rate-limited");
      expect(records[0].message).toContain("retry_after=30");

      // Dedup key must NOT be written — next tick should retry.
      expect(kv._store.has("tg:sent:inc_1:investigating")).toBe(false);

      // tg:error:last must be written.
      expect(kv._store.has("tg:error:last")).toBe(true);
      const errorRecord = JSON.parse(kv._store.get("tg:error:last")!) as {
        httpCode: number;
        incidentId: string;
      };
      expect(errorRecord.httpCode).toBe(429);
      expect(errorRecord.incidentId).toBe("inc_1");
    });
  });

  describe("403 forbidden handling", () => {
    it("does not write dedup key on 403 and records forbidden message", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ ok: false, error_code: 403, description: "Forbidden" }), {
            status: 403,
          }),
        ),
      );

      const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(1);
      expect(records[0].ok).toBe(false);
      expect(records[0].message).toContain("forbidden");

      expect(kv._store.has("tg:sent:inc_1:investigating")).toBe(false);
      expect(kv._store.has("tg:error:last")).toBe(true);
    });
  });

  describe("500 generic error handling", () => {
    it("returns ok=false and writes tg:error:last on 500", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ ok: false, description: "Internal Server Error" }), {
            status: 500,
          }),
        ),
      );

      const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(1);
      expect(records[0].ok).toBe(false);
      expect(records[0].message).toBe("http 500");

      expect(kv._store.has("tg:sent:inc_1:investigating")).toBe(false);
      expect(kv._store.has("tg:error:last")).toBe(true);
    });
  });

  describe("network error handling", () => {
    it("returns ok=false and writes tg:error:last on fetch throw", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Failed to fetch");
        }),
      );

      const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(1);
      expect(records[0].ok).toBe(false);
      expect(records[0].message).toBe("network error");

      expect(kv._store.has("tg:sent:inc_1:investigating")).toBe(false);
      expect(kv._store.has("tg:error:last")).toBe(true);
      const errorRecord = JSON.parse(kv._store.get("tg:error:last")!) as {
        httpCode: null;
        body: string;
      };
      expect(errorRecord.httpCode).toBeNull();
      expect(errorRecord.body).toContain("Failed to fetch");
    });
  });

  describe("feed-error detection", () => {
    it("sends feed-error notification when platform has been failing for 24+ hours", async () => {
      const kv = makeKv();

      // Simulate airtable ingestion status with 25-hour-old lastOkAt and an error.
      const staleLastOkAt = new Date(Date.parse(CHECKED_AT_ACTIVE) - 25 * 60 * 60 * 1000).toISOString();
      kv._store.set(
        "ingestion:provider:airtable",
        JSON.stringify({
          platform: "airtable",
          checkedAt: CHECKED_AT_ACTIVE,
          ok: false,
          activeIncidentCount: 0,
          providerType: "statuspage",
          confidence: "high",
          lastError: "fetch failed: timeout",
          lastOkAt: staleLastOkAt,
        }),
      );

      const env = makeEnv(kv);

      let capturedText = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { text: string };
          capturedText = body.text;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      // No incidents — only feed-error path fires.
      const records = await notifyTelegram(env, config, [], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(1);
      expect(records[0].ok).toBe(true);
      expect(capturedText).toContain("⚠️ [FEED ERROR] Airtable RSS — failing for 24+ hours");
      expect(capturedText).toContain("MYT");

      // Dedup key written with 1-day TTL.
      expect(kv._store.has("tg:sent:feedError:airtable")).toBe(true);
    });

    it("does not send feed-error when staleness is under 24 hours", async () => {
      const kv = makeKv();

      // 23-hour-old lastOkAt — below threshold.
      const recentLastOkAt = new Date(Date.parse(CHECKED_AT_ACTIVE) - 23 * 60 * 60 * 1000).toISOString();
      kv._store.set(
        "ingestion:provider:airtable",
        JSON.stringify({
          platform: "airtable",
          checkedAt: CHECKED_AT_ACTIVE,
          ok: false,
          activeIncidentCount: 0,
          providerType: "statuspage",
          confidence: "high",
          lastError: "fetch failed",
          lastOkAt: recentLastOkAt,
        }),
      );

      const env = makeEnv(kv);
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const records = await notifyTelegram(env, config, [], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("respects feed-error dedup — does not re-fire within 24 hours", async () => {
      const kv = makeKv();

      const staleLastOkAt = new Date(Date.parse(CHECKED_AT_ACTIVE) - 25 * 60 * 60 * 1000).toISOString();
      kv._store.set(
        "ingestion:provider:airtable",
        JSON.stringify({
          platform: "airtable",
          checkedAt: CHECKED_AT_ACTIVE,
          ok: false,
          activeIncidentCount: 0,
          providerType: "statuspage",
          confidence: "high",
          lastError: "fetch failed",
          lastOkAt: staleLastOkAt,
        }),
      );

      // Dedup already set — should suppress.
      kv._store.set("tg:sent:feedError:airtable", JSON.stringify({ sentAt: CHECKED_AT_ACTIVE }));

      const env = makeEnv(kv);
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const records = await notifyTelegram(env, config, [], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("implicit resolution detection", () => {
    it("fires ✅ RESOLVED when an incident disappears from the feed after being tracked", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      // Seed KV: incident was already notified (dedup key exists), tracked in active-set.
      kv._store.set("tg:sent:inc_1:investigating", JSON.stringify({ ok: true }));
      kv._store.set(
        "tg:active-set",
        JSON.stringify({
          inc_1: {
            platform: "airtable",
            severity: "minor",
            title: "Airtable API degraded",
            lastStatus: "investigating",
          },
        }),
      );

      const capturedTexts: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as { text: string };
          capturedTexts.push(body.text);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      // Pass an EMPTY incidents list — incident disappeared from the feed (resolved).
      const records = await notifyTelegram(env, config, [], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(1);
      expect(records[0].ok).toBe(true);
      expect(records[0].status).toBe("resolved");
      expect(records[0].incidentId).toBe("inc_1");
      expect(capturedTexts[0]).toContain("✅ [RESOLVED] Airtable — Airtable API degraded");
      expect(capturedTexts[0]).toContain("Severity: MINOR");

      // Resolved dedup key must be written.
      expect(kv._store.has("tg:sent:inc_1:resolved")).toBe(true);

      // Active-set must have the incident removed.
      const activeSet = JSON.parse(kv._store.get("tg:active-set")!) as Record<string, unknown>;
      expect(activeSet["inc_1"]).toBeUndefined();
    });

    it("adds incident to active-set on first delivery", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
      );

      await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      const activeSet = JSON.parse(kv._store.get("tg:active-set")!) as Record<
        string,
        { platform: string; title: string; lastStatus: string }
      >;
      expect(activeSet["inc_1"]).toBeDefined();
      expect(activeSet["inc_1"].platform).toBe("airtable");
      expect(activeSet["inc_1"].lastStatus).toBe("investigating");
    });

    it("does not double-fire resolved if tg:sent:{id}:resolved already exists", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      // Incident was notified and resolved-key already written (prior tick fired successfully).
      kv._store.set("tg:sent:inc_1:investigating", JSON.stringify({ ok: true }));
      kv._store.set("tg:sent:inc_1:resolved", JSON.stringify({ ok: true }));
      kv._store.set(
        "tg:active-set",
        JSON.stringify({
          inc_1: {
            platform: "airtable",
            severity: "minor",
            title: "Airtable API degraded",
            lastStatus: "investigating",
          },
        }),
      );

      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const records = await notifyTelegram(env, config, [], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();

      // Active-set must be cleaned up even though resolved was already sent.
      const activeSet = JSON.parse(kv._store.get("tg:active-set")!) as Record<string, unknown>;
      expect(activeSet["inc_1"]).toBeUndefined();
    });

    it("does not fire resolved when incident is still present in the feed", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      // Incident was already notified.
      kv._store.set("tg:sent:inc_1:investigating", JSON.stringify({ ok: true }));
      kv._store.set(
        "tg:active-set",
        JSON.stringify({
          inc_1: {
            platform: "airtable",
            severity: "minor",
            title: "Airtable API degraded",
            lastStatus: "investigating",
          },
        }),
      );

      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      // Incident is STILL in the list — no resolved notification should fire.
      const records = await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();

      // Active-set should still have the incident.
      const activeSet = JSON.parse(kv._store.get("tg:active-set")!) as Record<string, unknown>;
      expect(activeSet["inc_1"]).toBeDefined();
    });

    it("does not fire resolved for incident never in active-set (never alerted)", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      // No active-set entry — incident was never alerted (e.g. outside active hours).
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const records = await notifyTelegram(env, config, [], CHECKED_AT_ACTIVE);

      expect(records).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("topic ID handling", () => {
    it("includes message_thread_id when TELEGRAM_TOPIC_ID is set", async () => {
      const kv = makeKv();
      const env = makeEnv(kv);

      let capturedPayload: Record<string, unknown> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          capturedPayload = JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<string, unknown>;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(capturedPayload.message_thread_id).toBe(7825);
      expect(capturedPayload.chat_id).toBe("-1002968612512");
    });

    it("omits message_thread_id when TELEGRAM_TOPIC_ID is absent", async () => {
      const kv = makeKv();
      const env = { ...makeEnv(kv) };
      delete (env as Partial<Env>).TELEGRAM_TOPIC_ID;

      let capturedPayload: Record<string, unknown> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          capturedPayload = JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<string, unknown>;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      await notifyTelegram(env, config, [baseIncident], CHECKED_AT_ACTIVE);

      expect(capturedPayload.message_thread_id).toBeUndefined();
    });
  });
});
