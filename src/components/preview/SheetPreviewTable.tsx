import type { SheetData } from '@/types/mapping';

const MAX_PREVIEW_ROWS = 12;

export function SheetPreviewTable({ sheet }: { sheet: SheetData }) {
  const previewRows = sheet.rows.slice(0, MAX_PREVIEW_ROWS);

  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[var(--color-surface-alt)] text-left text-[var(--color-text-muted)]">
          <tr>
            {sheet.headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--color-border)]">
              {sheet.headers.map((h) => (
                <td key={h} className="max-w-[220px] truncate whitespace-nowrap px-3 py-2">
                  {String(row[h] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.rows.length > MAX_PREVIEW_ROWS && (
        <div className="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Showing {MAX_PREVIEW_ROWS} of {sheet.rows.length} rows
        </div>
      )}
    </div>
  );
}
