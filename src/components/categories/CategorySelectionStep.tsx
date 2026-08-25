import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, ListChecks } from 'lucide-react';
import { useAppState } from '@/hooks/useAppState';
import { useMappingData } from '@/hooks/useMappingData';
import { TEST_CATEGORIES } from '@/types/testCase';
import type { TestCategory } from '@/types/testCase';
import { GENERATORS, runGenerators } from '@/lib/generators';
import { CategoryCard } from '@/components/categories/CategoryCard';
import { Button } from '@/components/common/Button';

export function CategorySelectionStep() {
  const { state, actions } = useAppState();
  const { generatorContext } = useMappingData();

  const estimatedCounts = useMemo(() => {
    const counts: Partial<Record<TestCategory, number>> = {};
    for (const category of TEST_CATEGORIES) {
      try {
        counts[category] = GENERATORS[category](generatorContext).length;
      } catch {
        counts[category] = 0;
      }
    }
    return counts;
  }, [generatorContext]);

  const toggle = (category: TestCategory) => {
    const next = state.selectedCategories.includes(category)
      ? state.selectedCategories.filter((c) => c !== category)
      : [...state.selectedCategories, category];
    actions.setSelectedCategories(next);
  };

  const totalEstimated = state.selectedCategories.reduce((sum, c) => sum + (estimatedCounts[c] ?? 0), 0);

  const handleGenerate = () => {
    const testCases = runGenerators(state.selectedCategories, generatorContext);
    actions.setTestCases(testCases);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Select test case categories</h2>
          <p className="text-sm text-[var(--color-text-muted)]">Choose which types of ETL tests to generate.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => actions.setSelectedCategories([...TEST_CATEGORIES])}>
            Select All
          </Button>
          <Button variant="secondary" onClick={() => actions.setSelectedCategories([])}>
            Select None
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEST_CATEGORIES.map((category) => (
          <CategoryCard
            key={category}
            category={category}
            selected={state.selectedCategories.includes(category)}
            estimatedCount={estimatedCounts[category] ?? 0}
            onToggle={toggle}
          />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <Button variant="ghost" onClick={() => actions.setStep('preview')} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
        <Button
          disabled={state.selectedCategories.length === 0}
          onClick={handleGenerate}
          icon={<ListChecks size={16} />}
        >
          Generate ~{totalEstimated} Test Case{totalEstimated === 1 ? '' : 's'}
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
