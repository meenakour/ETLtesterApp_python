import type { DetectedColumn } from '@/types/columnMapping';
import { ColumnConfidenceBadge } from '@/components/preview/ColumnConfidenceBadge';

interface ColumnMappingPanelProps<K extends string> {
  columns: DetectedColumn<K>[];
  headers: string[];
  fieldLabels: Record<K, string>;
  requiredFields: K[];
  onOverride: (field: K, header: string | null) => void;
}

export function ColumnMappingPanel<K extends string>({
  columns,
  headers,
  fieldLabels,
  requiredFields,
  onOverride,
}: ColumnMappingPanelProps<K>) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-alt)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th className="px-4 py-2.5 font-medium">Field</th>
            <th className="px-4 py-2.5 font-medium">Detected Column</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Override</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => {
            const isRequired = requiredFields.includes(col.field);
            return (
              <tr key={col.field} className="border-t border-[var(--color-border)]">
                <td className="px-4 py-2.5 font-medium">
                  {fieldLabels[col.field]}
                  {isRequired && <span className="ml-1 text-[var(--color-danger)]">*</span>}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                  {col.matchedHeader ?? <span className="italic">Not matched</span>}
                  {col.inverted && <span className="ml-1 text-xs italic">(inverse)</span>}
                </td>
                <td className="px-4 py-2.5">
                  <ColumnConfidenceBadge confidence={col.confidence} matched={col.matchedHeader !== null} />
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                    value={col.matchedHeader ?? ''}
                    onChange={(e) => onOverride(col.field, e.target.value || null)}
                  >
                    <option value="">None</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
