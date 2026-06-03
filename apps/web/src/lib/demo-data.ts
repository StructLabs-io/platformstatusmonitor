import type {
  Incident,
  InstallConfig,
  RoutingDecision,
} from "@platform-status-monitor/shared";

export const demoConfig: InstallConfig = {
  name: "Demo Install",
  timezone: "America/New_York",
  dashboard: {
    tiers: [
      {
        id: "tier-1",
        displayName: "Tier 1",
        description: "Critical platforms for the demo team.",
        platforms: ["airtable", "openai"],
      },
      {
        id: "tier-2",
        displayName: "Tier 2",
        description: "Supporting delivery platforms.",
        platforms: ["github"],
      },
      {
        id: "tier-3",
        displayName: "Tier 3",
        description: "Watchlist platforms.",
        platforms: ["supabase"],
      },
    ],
  },
  platforms: {
    airtable: {
      displayName: "Airtable",
      statusPageUrl: "https://status.airtable.com",
      providerType: "statuspage",
      ingestion: ["rss", "webhook"],
      services: {
        interfaces: { displayName: "Interfaces" },
        api: { displayName: "API" },
      },
      zones: ["global", "us", "eu"],
    },
    openai: {
      displayName: "OpenAI",
      statusPageUrl: "https://status.openai.com",
      providerType: "statuspage",
      ingestion: ["rss", "webhook"],
      services: {
        api: { displayName: "API" },
        chatgpt: { displayName: "ChatGPT" },
      },
      zones: ["global"],
    },
    github: {
      displayName: "GitHub",
      statusPageUrl: "https://www.githubstatus.com",
      providerType: "statuspage",
      ingestion: ["rss"],
      services: {
        actions: { displayName: "Actions" },
        git: { displayName: "Git Operations" },
      },
      zones: ["global"],
    },
    supabase: {
      displayName: "Supabase",
      statusPageUrl: "https://status.supabase.com",
      providerType: "statuspage",
      ingestion: ["rss"],
      services: {
        database: { displayName: "Database" },
        auth: { displayName: "Auth" },
      },
      zones: ["global", "us", "eu", "br"],
    },
  },
  dependents: {
    "client-a": {
      type: "client",
      displayName: "Client A",
      timezone: "America/New_York",
      activeHours: { start: "09:00", end: "18:00" },
      dependencies: [
        {
          platform: "airtable",
          services: ["interfaces"],
          zones: ["global", "us"],
          criticality: "high",
          environment: "production",
        },
        {
          platform: "openai",
          services: ["api"],
          zones: ["global"],
          criticality: "medium",
          environment: "production",
        },
      ],
    },
    "internal-ops": {
      type: "team",
      displayName: "Internal Ops",
      timezone: "America/New_York",
      dependencies: [
        {
          platform: "github",
          services: ["actions"],
          zones: ["global"],
          criticality: "high",
          environment: "production",
        },
      ],
    },
  },
  venues: {
    webapp: { type: "webapp", displayName: "Webapp" },
    telegram: {
      type: "telegram",
      displayName: "Telegram Ops",
      botTokenSecret: "TELEGRAM_BOT_TOKEN",
      chatIdEnv: "TELEGRAM_CHAT_ID",
    },
  },
  routingRules: [
    {
      id: "show-critical",
      match: { severities: ["critical", "major"] },
      actions: [{ venue: "webapp" }, { venue: "telegram" }],
      options: { respectActiveHours: false, notifyOnResolved: true },
    },
    {
      id: "show-minor",
      match: { severities: ["minor"] },
      actions: [{ venue: "webapp" }],
      options: { respectActiveHours: true, notifyOnResolved: true },
    },
  ],
};

export const demoIncidents: Incident[] = [
  {
    id: "openai:demo-api-latency",
    source: "rss",
    platform: "openai",
    services: ["api"],
    zones: ["global"],
    severity: "minor",
    status: "monitoring",
    title: "Elevated API latency",
    summary: "API requests are slower than normal.",
    startedAt: "2026-05-27T14:30:00Z",
    updatedAt: "2026-05-27T15:00:00Z",
    resolvedAt: null,
    sourceUrl: "https://status.openai.com",
    fingerprint: "demo-openai",
    firstSeenAt: "2026-05-27T14:31:00Z",
    lastSeenAt: "2026-05-27T15:05:00Z",
    lastChangedAt: "2026-05-27T15:00:00Z",
    providerStatus: "active",
    raw: {},
  },
  {
    id: "supabase:demo-brazil",
    source: "rss",
    platform: "supabase",
    services: [],
    zones: ["br"],
    severity: "info",
    status: "identified",
    title: "Access issues from some providers in Brazil",
    summary: "A regional ISP issue is affecting access from Brazil.",
    startedAt: "2026-05-27T12:00:00Z",
    updatedAt: "2026-05-27T12:30:00Z",
    resolvedAt: null,
    sourceUrl: "https://status.supabase.com",
    providerStatus: "active",
    raw: {},
  },
];

export const demoDecisions: RoutingDecision[] = [
  {
    incidentId: "openai:demo-api-latency",
    decision: "visible",
    venues: ["webapp"],
    matchedDependents: ["client-a"],
    matchedRules: ["show-minor"],
    reason: [
      "platform matched dependent client-a: openai",
      "routing rule matched: show-minor",
    ],
    createdAt: "2026-05-27T15:05:00Z",
  },
  {
    incidentId: "supabase:demo-brazil",
    decision: "suppress_irrelevant",
    venues: [],
    matchedDependents: [],
    matchedRules: [],
    reason: ["no dependent dependency matched incident"],
    createdAt: "2026-05-27T15:05:00Z",
  },
];

export const demoProviders = [
  {
    platform: "openai",
    checkedAt: "2026-05-27T15:05:00Z",
    ok: true,
    activeIncidentCount: 1,
    providerType: "statuspage",
    confidence: "high" as const,
    lastError: null,
  },
  {
    platform: "supabase",
    checkedAt: "2026-05-27T15:05:00Z",
    ok: true,
    activeIncidentCount: 1,
    providerType: "statuspage",
    confidence: "high" as const,
    lastError: null,
  },
  {
    platform: "github",
    checkedAt: "2026-05-27T15:05:00Z",
    ok: true,
    activeIncidentCount: 0,
    providerType: "statuspage",
    confidence: "high" as const,
    lastError: null,
  },
];

export const demoDeliveries = [
  {
    id: "demo-delivery-1",
    incidentId: "openai:demo-api-latency",
    venue: "webapp",
    ok: true,
    deliveredAt: "2026-05-27T15:05:00Z",
    message: "visible in webapp",
  },
];

export const demoValidation = {
  valid: true,
  issues: [],
  checkedAt: "2026-05-27T15:05:00Z",
};
