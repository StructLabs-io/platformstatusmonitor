"use client";

import { useEffect, useState } from "react";
import { getRecentDecisions, getRecentIncidents, getValidation, type ValidationResult } from "../lib/api";
import type { Incident, RoutingDecision } from "@platform-status-monitor/shared";

export default function DashboardPage() {
  const [validation, setValidation] = useState<ValidationResult>({ valid: false, issues: ["Loading"] });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);

  useEffect(() => {
    void Promise.all([getValidation(), getRecentIncidents(), getRecentDecisions()]).then(([nextValidation, nextIncidents, nextDecisions]) => {
      setValidation(nextValidation);
      setIncidents(nextIncidents);
      setDecisions(nextDecisions);
    });
  }, []);

  return (
    <>
      <h2>Dashboard</h2>
      <div className="grid">
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
    </>
  );
}

