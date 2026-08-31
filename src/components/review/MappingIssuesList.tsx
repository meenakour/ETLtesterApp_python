import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { MappingIssue, MappingIssueSeverity } from '@/lib/mapping/reviewMapping';
import { Badge } from '@/components/common/Badge';

const SEVERITY_ORDER: MappingIssueSeverity[] = ['warning', 'info'];
const SEVERITY_LABEL: Record<MappingIssueSeverity, string> = { warning: 'Warnings', info: 'Suggestions' };

function rowLabel(sheetRowNumbers: number[]): string {
  return sheetRowNumbers.length > 1 ? `Rows ${sheetRowNumbers.join(', ')}` : `Row ${sheetRowNumbers[0]}`;
}

/**
 * Surfaces structural issues found in the mapping document (see reviewMapping.ts) -- purely
 * presentational and advisory. This component never gates anything; it only informs.
 */
export function MappingIssuesList({ issues }: { issues: MappingIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">
        <CheckCircle2 size={15} className="shrink-0" />
        <span>No issues found in the mapping document.</span>
      </div>
    );
  }

  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: issues.filter((i) => i.severity === severity).sort((a, b) => a.sheetRowNumbers[0] - b.sheetRowNumbers[0]),
  })).filter((g) => g.items.length > 0);

  const summary = bySeverity.map((g) => `${g.items.length} ${SEVERITY_LABEL[g.severity].toLowerCase()}`).join(', ');

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-sm font-medium">Mapping document review — {summary}</p>
      {bySeverity.map(({ severity, items }) => (
        <div
          key={severity}
          className={`space-y-1.5 rounded-lg px-3 py-2 text-sm ${
            severity === 'warning'
              ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
              : 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]'
          }`}
        >
          {items.map((issue) => (
            <div key={issue.id} className="flex items-start gap-2">
              {severity === 'warning' ? (
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              ) : (
                <Info size={15} className="mt-0.5 shrink-0" />
              )}
              <span className="flex-1">{issue.message}</span>
              <Badge tone="neutral">{rowLabel(issue.sheetRowNumbers)}</Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
