"use client";

import type { Incident } from "@platform-status-monitor/shared";
import { useEffect, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getRecentIncidents } from "../../lib/api";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    void getRecentIncidents().then(setIncidents);
  }, []);

  return (
    <>
      <h2>Incidents</h2>
      <DataTable
        empty="No recent incidents recorded."
        rows={incidents}
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

