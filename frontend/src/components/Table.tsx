export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  isActions?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({ columns, rows, rowKey, onRowClick }: TableProps<T>) {
  const fieldColumns = columns.filter((col) => !col.isActions);
  const actionColumns = columns.filter((col) => col.isActions);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((col) => (
                <th key={col.header} className={`px-4 py-3 font-medium ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
              >
                {columns.map((col) => (
                  <td key={col.header} className={`px-4 py-3 text-slate-700 ${col.className ?? ""}`}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={() => onRowClick?.(row)}
            className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${
              onRowClick ? "cursor-pointer" : ""
            }`}
          >
            <div className="space-y-2">
              {fieldColumns.map((col) => (
                <div key={col.header} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-gray-500">{col.header}</span>
                  <span className="text-right text-sm text-slate-700">{col.cell(row)}</span>
                </div>
              ))}
            </div>

            {actionColumns.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                {actionColumns.map((col) => (
                  <div key={col.header}>{col.cell(row)}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
