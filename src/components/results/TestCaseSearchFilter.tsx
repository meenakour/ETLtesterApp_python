import { Search } from 'lucide-react';
import { TEST_CATEGORIES, CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS } from '@/types/testCase';
import type { TestCategory, Priority } from '@/types/testCase';

interface TestCaseSearchFilterProps {
  query: string;
  onQueryChange: (q: string) => void;
  activeCategory: TestCategory | 'ALL';
  onCategoryChange: (c: TestCategory | 'ALL') => void;
  activePriority: Priority | 'ALL';
  onPriorityChange: (p: Priority | 'ALL') => void;
  manualReviewOnly: boolean;
  onManualReviewOnlyChange: (v: boolean) => void;
  cdeOnly: boolean;
  onCdeOnlyChange: (v: boolean) => void;
  dashboardOnly: boolean;
  onDashboardOnlyChange: (v: boolean) => void;
}

export function TestCaseSearchFilter({
  query,
  onQueryChange,
  activeCategory,
  onCategoryChange,
  activePriority,
  onPriorityChange,
  manualReviewOnly,
  onManualReviewOnlyChange,
  cdeOnly,
  onCdeOnlyChange,
  dashboardOnly,
  onDashboardOnlyChange,
}: TestCaseSearchFilterProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search test cases…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeCategory}
            onChange={(e) => onCategoryChange(e.target.value as TestCategory | 'ALL')}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm"
          >
            <option value="ALL">All Categories</option>
            {TEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>

          <select
            value={activePriority}
            onChange={(e) => onPriorityChange(e.target.value as Priority | 'ALL')}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm"
          >
            <option value="ALL">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={manualReviewOnly}
            onChange={(e) => onManualReviewOnlyChange(e.target.checked)}
          />
          Manual review only
        </label>

        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
          <input type="checkbox" checked={cdeOnly} onChange={(e) => onCdeOnlyChange(e.target.checked)} />
          CDE only
        </label>

        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
          <input type="checkbox" checked={dashboardOnly} onChange={(e) => onDashboardOnlyChange(e.target.checked)} />
          Dashboard comparison only
        </label>
      </div>
    </div>
  );
}
