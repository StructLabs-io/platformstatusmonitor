"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getConfig, getProviderIngestionStatuses } from "../../lib/api";

interface PlatformRow {
  id: string;
  displayName: string;
  ingestion: string;
  health: string;
  services: string;
  zones: string;
}

export default function PlatformsPage() {
  const [rows, setRows] = useState<PlatformRow[]>([]);

  useEffect(() => {
    void Promise.all([getConfig(), getProviderIngestionStatuses()]).then(([config, providers]) => {
      const providerByPlatform = new Map(providers.map((provider) => [provider.platform, provider]));
      setRows(
        Object.entries(config?.platforms ?? {}).map(([id, platform]) => ({
          id,
          displayName: platform.displayName,
          ingestion: platform.ingestion.join(", "),
          health: providerByPlatform.get(id)
            ? `${providerByPlatform.get(id)?.ok ? "OK" : "Error"} · ${providerByPlatform.get(id)?.activeIncidentCount ?? 0} active`
            : "Not checked",
          services: Object.keys(platform.services).join(", "),
          zones: platform.zones.join(", ")
        }))
      );
    });
  }, []);

  return (
    <>
      <h2>Platforms</h2>
      <DataTable
        empty="No platforms loaded."
        rows={rows}
        columns={[
          { key: "id", label: "ID", render: (row) => row.id },
          { key: "displayName", label: "Name", render: (row) => row.displayName },
          { key: "ingestion", label: "Ingestion", render: (row) => row.ingestion },
          { key: "health", label: "Provider health", render: (row) => row.health },
          { key: "services", label: "Services", render: (row) => row.services },
          { key: "zones", label: "Zones", render: (row) => row.zones }
        ]}
      />
    </>
  );
}
