"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../../components/data-table";
import { getConfig, getRecentDeliveries } from "../../lib/api";

interface VenueRow {
  id: string;
  displayName: string;
  type: string;
  secretRefs: string;
}

interface DeliveryRow {
  id: string;
  incidentId: string;
  venue: string;
  result: string;
  deliveredAt: string;
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);

  useEffect(() => {
    void Promise.all([getConfig(), getRecentDeliveries()]).then(
      ([config, records]) => {
        setVenues(
          Object.entries(config?.venues ?? {}).map(([id, venue]) => ({
            id,
            displayName: venue.displayName,
            type: venue.type,
            secretRefs:
              venue.type === "telegram"
                ? [venue.botTokenSecret, venue.chatIdEnv, venue.topicIdEnv].filter(Boolean).join(", ")
                : venue.type === "slack"
                  ? venue.webhookUrlEnv
                  : "none",
          })),
        );
        setDeliveries(
          records.map((record) => ({
            id: record.id,
            incidentId: record.incidentId,
            venue: record.venue,
            result: `${record.ok ? "OK" : "Failed"} · ${record.message}`,
            deliveredAt: record.deliveredAt,
          })),
        );
      },
    );
  }, []);

  return (
    <>
      <h2>Venues</h2>
      <div className="stack">
        <DataTable
          empty="No notification venues loaded."
          rows={venues}
          columns={[
            { key: "id", label: "ID", render: (row) => row.id },
            { key: "displayName", label: "Name", render: (row) => row.displayName },
            { key: "type", label: "Type", render: (row) => row.type },
            { key: "secretRefs", label: "Secret refs", render: (row) => row.secretRefs },
          ]}
        />
        <DataTable
          empty="No delivery attempts recorded."
          rows={deliveries}
          columns={[
            { key: "venue", label: "Venue", render: (row) => row.venue },
            { key: "incidentId", label: "Incident", render: (row) => row.incidentId },
            { key: "result", label: "Result", render: (row) => row.result },
            { key: "deliveredAt", label: "Delivered", render: (row) => row.deliveredAt },
          ]}
        />
      </div>
    </>
  );
}
