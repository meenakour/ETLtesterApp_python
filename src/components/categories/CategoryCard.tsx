import type { TestCategory } from '@/types/testCase';
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from '@/types/testCase';
import { Check } from 'lucide-react';

interface CategoryCardProps {
  category: TestCategory;
  selected: boolean;
  estimatedCount: number;
  onToggle: (category: TestCategory) => void;
}

export function CategoryCard({ category, selected, estimatedCount, onToggle }: CategoryCardProps) {
  return (
    <button
      onClick={() => onToggle(category)}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{CATEGORY_LABELS[category]}</h3>
        <div
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            selected ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white' : 'border-[var(--color-border)]'
          }`}
        >
          {selected && <Check size={12} />}
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{CATEGORY_DESCRIPTIONS[category]}</p>
      <p className="text-xs font-medium text-[var(--color-accent)]">~{estimatedCount} test case{estimatedCount === 1 ? '' : 's'}</p>
    </button>
  );
}
