"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getConfig } from "../../lib/api";

interface RouteRow {
  id: string;
  severities: string;
  actions: string;
}

export default function RoutesPage() {
  const [rows, setRows] = useState<RouteRow[]>([]);

  useEffect(() => {
    void getConfig().then((config) => {
      setRows(
        (config?.routingRules ?? []).map((rule) => ({
          id: rule.id,
          severities: rule.match.severities?.join(", ") ?? "any",
          actions: rule.actions.map((action) => action.venue).join(", ")
        }))
      );
    });
  }, []);

  return (
    <>
      <h2>Routes</h2>
      <DataTable
        empty="No routes loaded."
        rows={rows}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "severities", label: "Severities", render: (row) => row.severities },
          { key: "actions", label: "Actions", render: (row) => row.actions }
        ]}
      />
    </>
  );
}

