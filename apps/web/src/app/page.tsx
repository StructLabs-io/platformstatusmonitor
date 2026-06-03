"use client";

import { useEffect, useState } from "react";
import { Link as LinkIcon } from "lucide-react";
import type { Incident, InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import { getConfig, getRecentDecisions, getRecentIncidents, getValidation, type ValidationResult } from "../lib/api";
import { buildPlatformHealth, buildPlatformTiers, formatIncidentScope, formatImpactLine, getOwnedEntityName, type PlatformHealth, type PlatformTier } from "../lib/dashboard-status";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Card, CardFooter } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

type LoadState = "loading" | "ready" | "degraded";

export default function DashboardPage() {
  const [validation, setValidation] = useState<ValidationResult>({ valid: false, issues: ["Loading"] });
  const [config, setConfig] = useState<InstallConfig | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    void Promise.all([getValidation(), getConfig(), getRecentIncidents(), getRecentDecisions()]).then(([nextValidation, nextConfig, nextIncidents, nextDecisions]) => {
      setValidation(nextValidation);
      setConfig(nextConfig);
      setIncidents(nextIncidents);
      setDecisions(nextDecisions);
      setLoadState(nextConfig && nextValidation.valid ? "ready" : "degraded");
    });
  }, []);

  const platformHealth = config ? buildPlatformHealth(config, incidents, decisions) : [];
  const platformTiers = config ? buildPlatformTiers(config, platformHealth) : [];
  const impactedPlatforms = platformHealth.filter((platform) => platform.incident && platform.impactedDependents.length > 0);

  return (
    <>
      <h2>Dashboard</h2>
      <HealthNotice loadState={loadState} validation={validation} />
      <ImpactBanner config={config} platforms={impactedPlatforms} />
      <section className="dashboard-section">
        <div className="section-heading">
          <h3>Monitored Platforms</h3>
          <p className="muted">Grouped by dashboard tiers</p>
        </div>
        {loadState === "loading" ? <PlatformSkeleton /> : <TieredPlatformGrid config={config} tiers={platformTiers} />}
      </section>
    </>
  );
}

function HealthNotice({ loadState, validation }: { loadState: LoadState; validation: ValidationResult }) {
  if (loadState === "loading") {
    return (
      <Alert className="notice">
        <AlertTitle>Loading</AlertTitle>
        <AlertDescription>Loading platform status from the Worker.</AlertDescription>
      </Alert>
    );
  }

  if (loadState !== "degraded" && validation.valid) return null;

  return (
    <Alert className="notice bad-notice" variant="destructive">
      <AlertTitle>Status data is degraded</AlertTitle>
      <AlertDescription>
        {validation.issues.length > 0 ? validation.issues.join(" ") : "The Worker or bundled config is unavailable."}
      </AlertDescription>
    </Alert>
  );
}

function ImpactBanner({ config, platforms }: { config: InstallConfig | null; platforms: PlatformHealth[] }) {
  if (platforms.length === 0) return null;
  const ownedEntityName = config ? getOwnedEntityName(config) : null;

  return (
    <Alert className="impact-banner">
      <Badge className="banner-label" variant="outline">Impact</Badge>
      <div className="impact-copy">
        {platforms.map((platform) => (
          <p key={platform.id}>
            {formatImpactLine(platform.displayName, platform.impactedDependents, ownedEntityName)}
          </p>
        ))}
      </div>
    </Alert>
  );
}

function PlatformSkeleton() {
  return (
    <div className="platform-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card aria-hidden="true" className="platform-card skeleton-card" key={index}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </Card>
      ))}
    </div>
  );
}

function TieredPlatformGrid({ config, tiers }: { config: InstallConfig | null; tiers: PlatformTier[] }) {
  return (
    <div className="tier-stack">
      {tiers
        .filter((tier) => tier.platforms.length > 0)
        .map((tier) => (
          <section className="tier-section" key={tier.id}>
            <div className="tier-heading">
              <h4>{tier.displayName}</h4>
              {tier.description ? <p className="muted">{tier.description}</p> : null}
            </div>
            <div className="platform-grid">
              {tier.platforms.map((platform) => (
                <PlatformCard config={config} key={platform.id} platform={platform} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function PlatformCard({ config, platform }: { config: InstallConfig | null; platform: PlatformHealth }) {
  const incident = platform.incident;
  const href = incident?.sourceUrl || platform.statusPageUrl || "#";
  const label = incident ? formatIncidentScope(config as InstallConfig, incident) || incident.status : "Operational";
  const host = getHost(incident?.sourceUrl || platform.statusPageUrl);
  const iconUrl = getPlatformIconUrl(platform);

  return (
    <Card className={`platform-card ${platform.level}`}>
      <a className="platform-card-main" href={href} rel="noreferrer" target={href.startsWith("http") ? "_blank" : undefined}>
        <span aria-hidden="true" className="platform-logo">
          <img alt="" loading="lazy" src={iconUrl} />
        </span>
        <span>
          <span className="platform-title">{platform.displayName}</span>
          <span className="platform-state">{label}</span>
          {incident ? <span className="platform-scope">{incident.title}</span> : null}
        </span>
        <span aria-label={`${platform.displayName} ${platform.level}`} className={`status-dot ${platform.level}`} role="img" />
      </a>
      {platform.statusPageUrl ? (
        <CardFooter className="platform-card-footer">
          <a className="status-link" href={platform.statusPageUrl} rel="noreferrer" target="_blank">
            <LinkIcon aria-hidden="true" className="status-link-icon" />
            {host}
          </a>
        </CardFooter>
      ) : (
        <CardFooter className="platform-card-footer">
          <span className="status-link unavailable">No status page</span>
        </CardFooter>
      )}
    </Card>
  );
}

function getHost(url?: string | null) {
  if (!url) return "status page";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "status page";
  }
}

function getPlatformIconUrl(platform: PlatformHealth): string {
  const domain = platformIconDomains[platform.id] ?? getHost(platform.statusPageUrl);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

const platformIconDomains: Record<string, string> = {
  airtable: "airtable.com",
  anthropic: "anthropic.com",
  clickup: "clickup.com",
  digitalocean: "digitalocean.com",
  docusign: "docusign.com",
  fathom: "fathom.video",
  github: "github.com",
  glide: "glideapps.com",
  "google-cloud": "cloud.google.com",
  "google-gemini": "gemini.google.com",
  "google-workspace": "workspace.google.com",
  lob: "lob.com",
  make: "make.com",
  openai: "openai.com",
  openrouter: "openrouter.ai",
  pdfco: "pdf.co",
  perplexity: "perplexity.ai",
  quickbooks: "quickbooks.intuit.com",
  "quickbooks-dev": "developer.intuit.com",
  slack: "slack.com",
  stacker: "stackerhq.com",
  stripe: "stripe.com",
  supabase: "supabase.com",
  toggl: "toggl.com",
  "wispr-flow": "wisprflow.ai",
  xero: "xero.com",
};
