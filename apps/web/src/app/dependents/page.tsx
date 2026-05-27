"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getConfig } from "../../lib/api";

interface DependentRow {
  id: string;
  displayName: string;
  type: string;
  timezone: string;
  dependencies: string;
}

export default function DependentsPage() {
  const [rows, setRows] = useState<DependentRow[]>([]);

  useEffect(() => {
    void getConfig().then((config) => {
      setRows(
        Object.entries(config?.dependents ?? {}).map(([id, dependent]) => ({
          id,
          displayName: dependent.displayName,
          type: dependent.type,
          timezone: dependent.timezone,
          dependencies: dependent.dependencies.map((dependency) => dependency.platform).join(", ")
        }))
      );
    });
  }, []);

  return (
    <>
      <h2>Dependents</h2>
      <DataTable
        empty="No dependents loaded."
        rows={rows}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "displayName", label: "Name", render: (row) => row.displayName },
          { key: "type", label: "Type", render: (row) => row.type },
          { key: "timezone", label: "Timezone", render: (row) => row.timezone },
          { key: "dependencies", label: "Dependencies", render: (row) => row.dependencies }
        ]}
      />
    </>
  );
}

