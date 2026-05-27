"use client";

import { useEffect, useState } from "react";
import type { Incident, InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import { getConfig, getRecentDecisions, getRecentIncidents, getValidation, type ValidationResult } from "../lib/api";
import { buildPlatformHealth, buildPlatformTiers, formatIncidentScope, type PlatformHealth, type PlatformTier } from "../lib/dashboard-status";

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
      <div className="metric-grid">
        <section className="panel">
          <h3>Config</h3>
          <div className={validation.valid ? "metric ok" : "metric bad"}>{validation.valid ? "Valid" : "Review"}</div>
          <p className="muted">{validation.issues.length} issue(s)</p>
        </section>
        <section className="panel">
          <h3>Recent Incidents</h3>
          <div className="metric">{incidents.length}</div>
          <p className="muted">KV recent index</p>
        </section>
        <section className="panel">
          <h3>Recent Decisions</h3>
          <div className="metric">{decisions.length}</div>
          <p className="muted">Visible and suppressed</p>
        </section>
      </div>
      <HealthNotice loadState={loadState} validation={validation} />
      <ImpactBanner platforms={impactedPlatforms} />
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
    return <section className="notice">Loading platform status from the Worker.</section>;
  }

  if (loadState !== "degraded" && validation.valid) return null;

  return (
    <section className="notice bad-notice">
      Status data is degraded. {validation.issues.length > 0 ? validation.issues.join(" ") : "The Worker or bundled config is unavailable."}
    </section>
  );
}

function ImpactBanner({ platforms }: { platforms: PlatformHealth[] }) {
  if (platforms.length === 0) return null;

  return (
    <section className="impact-banner">
      {platforms.map((platform) => (
        <p key={platform.id}>
          <strong>{platform.displayName}</strong> is impacting {platform.impactedDependents.join(", ")}.
        </p>
      ))}
    </section>
  );
}

function PlatformSkeleton() {
  return (
    <div className="platform-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div aria-hidden="true" className="platform-card skeleton-card" key={index}>
          <span />
          <span />
          <span />
        </div>
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

  return (
    <article className={`platform-card ${platform.level}`}>
      <a className="platform-card-main" href={href} rel="noreferrer" target={href.startsWith("http") ? "_blank" : undefined}>
        <span aria-hidden="true" className={`status-dot ${platform.level}`} />
        <span>
          <span className="platform-title">{platform.displayName}</span>
          <span className="platform-state">{label}</span>
        </span>
      </a>
      {platform.statusPageUrl ? (
        <a className="status-link" href={platform.statusPageUrl} rel="noreferrer" target="_blank">
          Status page
        </a>
      ) : (
        <span className="status-link unavailable">No status page</span>
      )}
    </article>
  );
}
