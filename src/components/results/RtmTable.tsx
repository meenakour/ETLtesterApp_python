import type { RtmEntry } from '@/lib/rtm';
import { Badge } from '@/components/common/Badge';

export function RtmTable({ entries }: { entries: RtmEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-text-muted)]">
        No requirements match your current filter.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--color-surface-alt)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Req. ID</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Target</th>
              <th className="px-4 py-2.5 font-medium">Transformation</th>
              <th className="px-4 py-2.5 font-medium">PK / Nullable</th>
              <th className="px-4 py-2.5 font-medium">Covered By</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.requirementId} className="border-t border-[var(--color-border)] align-top">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                  {entry.requirementId}
                </td>
                <td className="px-4 py-2.5">
                  {entry.sourceTable}.{entry.sourceField}
                </td>
                <td className="px-4 py-2.5">
                  {entry.targetTable}.{entry.targetField}
                </td>
                <td className="max-w-[260px] truncate px-4 py-2.5 text-[var(--color-text-muted)]" title={entry.transformation}>
                  {entry.transformation || 'Same as source'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                  {entry.isPrimaryKey ? 'PK' : '–'} / {entry.isNullable ? 'Nullable' : 'Not Null'}
                </td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                  {entry.coveredTestCaseIds.length > 0 ? entry.coveredTestCaseIds.join(', ') : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  {entry.covered ? (
                    <Badge tone="success">Covered ({entry.testCaseCount})</Badge>
                  ) : (
                    <Badge tone="danger">Gap</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
