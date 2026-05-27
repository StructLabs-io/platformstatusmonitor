import { z } from "zod";

export const severitySchema = z.enum(["critical", "major", "minor", "maintenance", "info"]);
export const statusSchema = z.enum(["investigating", "identified", "monitoring", "resolved", "postmortem"]);
export const ingestionSchema = z.enum(["rss", "webhook", "synthetic"]);

export const timeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/)
});

export const platformSchema = z.object({
  displayName: z.string().min(1),
  statusPageUrl: z.url().optional(),
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

export const installConfigSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().optional(),
  platforms: z.record(z.string(), platformSchema),
  dependents: z.record(z.string(), dependentSchema),
  venues: z.record(z.string(), venueSchema),
  routingRules: z.array(routingRuleSchema)
});

export type InstallConfig = z.infer<typeof installConfigSchema>;

