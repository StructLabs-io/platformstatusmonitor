import { z } from "zod";

export const severitySchema = z.enum(["critical", "major", "minor", "maintenance", "info"]);
export const statusSchema = z.enum(["investigating", "identified", "monitoring", "resolved", "postmortem"]);
export const ingestionSchema = z.enum(["rss", "webhook", "synthetic"]);
export const providerTypeSchema = z.enum([
  "statuspage",
  "rss",
  "incidentio",
  "instatus",
  "synthetic"
]);

const providerUrlSchema = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:";
  }, "Provider URLs must use https")
  .refine((value) => {
    const hostname = new URL(value).hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) return false;
    const parts = hostname.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
    const [a, b] = parts;
    return !(
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }, "Provider URLs must not target localhost, link-local, or private networks");

export const timeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/)
});

export const platformSchema = z.object({
  displayName: z.string().min(1),
  statusPageUrl: providerUrlSchema.optional(),
  providerType: providerTypeSchema.optional(),
  rssFeedUrl: providerUrlSchema.optional(),
  syntheticCheckUrl: providerUrlSchema.optional(),
  ingestion: z.array(ingestionSchema).min(1),
  services: z.record(z.string(), z.object({ displayName: z.string().min(1) })).default({}),
  zones: z.array(z.string().min(1)).default(["global"])
});

export const dependencySchema = z.object({
  platform: z.string().min(1),
  services: z.array(z.string().min(1)).default([]),
  zones: z.array(z.string().min(1)).default(["global"]),
  criticality: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  environment: z.string().default("production")
});

export const dependentSchema = z.object({
  type: z.enum(["client", "project", "team", "environment", "internal-system"]),
  displayName: z.string().min(1),
  timezone: z.string().min(1),
  activeHours: timeWindowSchema.optional(),
  dependencies: z.array(dependencySchema).default([])
});

export const venueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webapp"), displayName: z.string().min(1) }),
  z.object({
    type: z.literal("telegram"),
    displayName: z.string().min(1),
    botTokenSecret: z.string().min(1),
    chatIdEnv: z.string().min(1),
    topicIdEnv: z.string().optional()
  }),
  z.object({
    type: z.literal("slack"),
    displayName: z.string().min(1),
    webhookUrlEnv: z.string().min(1)
  })
]);

export const routingRuleSchema = z.object({
  id: z.string().min(1),
  match: z.object({
    dependents: z.array(z.string()).optional(),
    platforms: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
    zones: z.array(z.string()).optional(),
    severities: z.array(severitySchema).optional(),
    statuses: z.array(statusSchema).optional(),
    environments: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional()
  }),
  actions: z.array(z.object({ venue: z.string().min(1) })).min(1),
  options: z
    .object({
      respectActiveHours: z.boolean().default(true),
      bypassQuietHours: z.boolean().default(false),
      notifyOnResolved: z.boolean().default(true)
    })
    .partial()
    .default({})
});

export const dashboardTierSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  platforms: z.array(z.string().min(1)).default([])
});

export const dashboardSchema = z
  .object({
    tiers: z.array(dashboardTierSchema).default([])
  })
  .default({ tiers: [] });

export const installConfigSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().optional(),
  dashboard: dashboardSchema.optional(),
  platforms: z.record(z.string(), platformSchema),
  dependents: z.record(z.string(), dependentSchema),
  venues: z.record(z.string(), venueSchema),
  routingRules: z.array(routingRuleSchema)
});

export type InstallConfig = z.infer<typeof installConfigSchema>;
