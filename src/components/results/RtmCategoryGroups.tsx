import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CategoryRtmGroup, RtmEntry } from '@/lib/rtm';
import { CATEGORY_LABELS } from '@/types/testCase';
import { Badge } from '@/components/common/Badge';
import { RtmTable } from '@/components/results/RtmTable';

export function RtmCategoryGroups({ groups, gaps }: { groups: CategoryRtmGroup[]; gaps: RtmEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Gaps start expanded, unlike the category groups below -- they're the highest-priority thing to
  // see, and today's gap count is already permanently visible rather than hidden behind a filter.
  const [gapsExpanded, setGapsExpanded] = useState(true);

  const toggle = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[var(--color-danger)]">
        <button
          onClick={() => setGapsExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 bg-[var(--color-danger-soft)] px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-danger)]">
            {gapsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Gaps — mapping rows with no covering test case in any category
          </span>
          <Badge tone="danger">{gaps.length}</Badge>
        </button>
        {gapsExpanded && (
          <div className="p-4">
            <RtmTable entries={gaps} />
          </div>
        )}
      </div>

      {groups.map((group) => {
        const isOpen = expanded.has(group.category);
        return (
          <div key={group.category} className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <button
              onClick={() => toggle(group.category)}
              className="flex w-full items-center justify-between gap-3 bg-[var(--color-surface)] px-4 py-3 text-left hover:bg-[var(--color-surface-alt)]"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {CATEGORY_LABELS[group.category]}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="accent">
                  {group.testCaseCount} test case{group.testCaseCount === 1 ? '' : 's'}
                </Badge>
                <Badge tone="neutral">
                  {group.coveredMappingRowCount} mapping row{group.coveredMappingRowCount === 1 ? '' : 's'} covered
                </Badge>
              </span>
            </button>
            {isOpen && (
              <div className="p-4">
                <RtmTable entries={group.entries} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
