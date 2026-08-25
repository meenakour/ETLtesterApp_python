import { X } from 'lucide-react';
import type { TestCase } from '@/types/testCase';
import { CATEGORY_LABELS } from '@/types/testCase';
import { Badge } from '@/components/common/Badge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import {
  CDE_TOOLTIP,
  MANUAL_REVIEW_TOOLTIP,
  DASHBOARD_COMPARISON_TOOLTIP,
  AI_SUGGESTED_TOOLTIP,
} from '@/components/common/badgeTooltips';
import { SqlCodeBlock } from '@/components/results/SqlCodeBlock';

export function TestCaseDetailPanel({ testCase, onClose }: { testCase: TestCase; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--color-surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge tone="accent">{testCase.id}</Badge>
              <Badge tone="neutral">{CATEGORY_LABELS[testCase.category]}</Badge>
              <PriorityBadge priority={testCase.priority} />
              {testCase.isCde && (
                <Badge tone="danger" title={CDE_TOOLTIP}>
                  CDE
                </Badge>
              )}
              {testCase.isManualReview && (
                <Badge tone="warning" title={MANUAL_REVIEW_TOOLTIP}>
                  Manual Review
                </Badge>
              )}
              {testCase.isDashboardComparison && (
                <Badge tone="accent" title={DASHBOARD_COMPARISON_TOOLTIP}>
                  Dashboard Comparison
                </Badge>
              )}
              {testCase.isAiSuggested && (
                <Badge tone="accent" title={AI_SUGGESTED_TOOLTIP}>
                  AI-Suggested
                </Badge>
              )}
            </div>
            <h2 className="text-lg font-semibold">{testCase.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 text-sm">
          <div>
            <h3 className="mb-1 font-medium text-[var(--color-text-muted)]">Target Table</h3>
            <p>{testCase.targetTable}</p>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-[var(--color-text-muted)]">Description</h3>
            <p>{testCase.description}</p>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-[var(--color-text-muted)]">Test Steps</h3>
            <ol className="list-decimal space-y-1 pl-5">
              {testCase.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-[var(--color-text-muted)]">Expected Result</h3>
            <p>{testCase.expectedResult}</p>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-[var(--color-text-muted)]">SQL Query (Databricks / Spark SQL)</h3>
            <SqlCodeBlock sql={testCase.sql} />
          </div>
        </div>
      </div>
    </div>
  );
}
