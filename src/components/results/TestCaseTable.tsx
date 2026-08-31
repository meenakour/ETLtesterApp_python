import type { TestCase } from '@/types/testCase';
import { CATEGORY_LABELS } from '@/types/testCase';
import { Badge } from '@/components/common/Badge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import {
  CDE_TOOLTIP,
  MANUAL_REVIEW_TOOLTIP,
  DASHBOARD_COMPARISON_TOOLTIP,
  AI_SUGGESTED_TOOLTIP,
  AI_GENERATED_TOOLTIP,
} from '@/components/common/badgeTooltips';

export function TestCaseTable({
  testCases,
  onSelect,
}: {
  testCases: TestCase[];
  onSelect: (tc: TestCase) => void;
}) {
  if (testCases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-text-muted)]">
        No test cases match your current search/filter.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-alt)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th className="px-4 py-2.5 font-medium">ID</th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Priority</th>
            <th className="px-4 py-2.5 font-medium">Target Table</th>
            <th className="px-4 py-2.5 font-medium" title="Hover a flag badge for what it means">
              Flags
            </th>
          </tr>
        </thead>
        <tbody>
          {testCases.map((tc) => (
            <tr
              key={tc.id}
              onClick={() => onSelect(tc)}
              className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]"
            >
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">{tc.id}</td>
              <td className="px-4 py-2.5">{tc.name}</td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <Badge tone="neutral">{CATEGORY_LABELS[tc.category]}</Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <PriorityBadge priority={tc.priority} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-text-muted)]">{tc.targetTable}</td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <div className="flex gap-1">
                  {tc.isCde && (
                    <Badge tone="danger" title={CDE_TOOLTIP}>
                      CDE
                    </Badge>
                  )}
                  {tc.isManualReview && (
                    <Badge tone="warning" title={MANUAL_REVIEW_TOOLTIP}>
                      Manual Review
                    </Badge>
                  )}
                  {tc.isDashboardComparison && (
                    <Badge tone="accent" title={DASHBOARD_COMPARISON_TOOLTIP}>
                      Dashboard Comparison
                    </Badge>
                  )}
                  {tc.isAiSuggested && (
                    <Badge tone="accent" title={AI_SUGGESTED_TOOLTIP}>
                      AI-Suggested
                    </Badge>
                  )}
                  {tc.isAiGenerated && (
                    <Badge tone="accent" title={AI_GENERATED_TOOLTIP}>
                      AI-Generated
                    </Badge>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
