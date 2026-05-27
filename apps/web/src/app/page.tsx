"use client";

import { useEffect, useState } from "react";
import type { Incident, InstallConfig, RoutingDecision } from "@platform-status-monitor/shared";
import { getConfig, getRecentDecisions, getRecentIncidents, getValidation, type ValidationResult } from "../lib/api";
import { buildPlatformHealth, formatIncidentScope, type PlatformHealth } from "../lib/dashboard-status";

export default function DashboardPage() {
  const [validation, setValidation] = useState<ValidationResult>({ valid: false, issues: ["Loading"] });
  const [config, setConfig] = useState<InstallConfig | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);

  useEffect(() => {
    void Promise.all([getValidation(), getConfig(), getRecentIncidents(), getRecentDecisions()]).then(([nextValidation, nextConfig, nextIncidents, nextDecisions]) => {
      setValidation(nextValidation);
      setConfig(nextConfig);
      setIncidents(nextIncidents);
      setDecisions(nextDecisions);
    });
  }, []);

  const platformHealth = config ? buildPlatformHealth(config, incidents, decisions) : [];
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
      <ImpactBanner platforms={impactedPlatforms} />
      <section className="dashboard-section">
        <div className="section-heading">
          <h3>Monitored Platforms</h3>
          <p className="muted">Ordered from JSON config</p>
        </div>
        <div className="platform-grid">
          {platformHealth.map((platform) => (
            <PlatformCard config={config} key={platform.id} platform={platform} />
          ))}
        </div>
      </section>
    </>
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
