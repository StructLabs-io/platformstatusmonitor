"use client";

import type { Incident } from "@platform-status-monitor/shared";
import { useEffect, useState } from "react";
import { DataTable } from "../../components/data-table";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { getRecentIncidents } from "../../lib/api";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");

  useEffect(() => {
    void getRecentIncidents().then(setIncidents);
  }, []);

  const filteredIncidents = incidents.filter((incident) => {
    const text = `${incident.platform} ${incident.severity} ${incident.status} ${incident.title} ${incident.services.join(" ")} ${incident.zones.join(" ")}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (severity === "all" || incident.severity === severity)
    );
  });

  return (
    <>
      <h2>Incidents</h2>
      <div className="toolbar">
        <Input
          aria-label="Search incidents"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search incidents"
          value={query}
        />
        <NativeSelect
          aria-label="Filter severity"
          onChange={(event) => setSeverity(event.target.value)}
          value={severity}
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="maintenance">Maintenance</option>
          <option value="info">Info</option>
        </NativeSelect>
      </div>
      <DataTable
        empty="No recent incidents recorded."
        rows={filteredIncidents}
        columns={[
          { key: "platform", label: "Platform", render: (row) => row.platform },
          { key: "severity", label: "Severity", render: (row) => row.severity },
          { key: "status", label: "Status", render: (row) => row.status },
          { key: "title", label: "Title", render: (row) => row.title },
          { key: "updatedAt", label: "Updated", render: (row) => row.updatedAt }
        ]}
      />
    </>
  );
}
