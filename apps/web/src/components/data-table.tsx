import type { ReactNode } from "react";

interface DataTableProps<T> {
  columns: Array<{ key: string; label: string; render: (row: T) => ReactNode }>;
  empty: string;
  rows: T[];
}

export function DataTable<T>({ columns, empty, rows }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="empty">{empty}</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={column.key}>{column.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

