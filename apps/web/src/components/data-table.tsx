import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

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
    <div className="table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
