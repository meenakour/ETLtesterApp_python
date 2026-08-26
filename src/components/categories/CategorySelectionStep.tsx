import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ListChecks, Loader2 } from 'lucide-react';
import { useAppState } from '@/hooks/useAppState';
import { useAiAssist } from '@/hooks/useAiAssist';
import { useMappingData } from '@/hooks/useMappingData';
import { TEST_CATEGORIES } from '@/types/testCase';
import type { TestCategory } from '@/types/testCase';
import { GENERATORS, runGenerators } from '@/lib/generators';
import { generateTestCasesViaPythonEngine } from '@/lib/pythonEngine';
import { CategoryCard } from '@/components/categories/CategoryCard';
import { Button } from '@/components/common/Button';

export function CategorySelectionStep() {
  const { state, actions } = useAppState();
  const { generatorContext } = useMappingData();
  const { serverUrl } = useAiAssist();
  const [usePythonEngine, setUsePythonEngine] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

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

  const handleGenerate = async () => {
    if (!usePythonEngine) {
      const testCases = runGenerators(state.selectedCategories, generatorContext);
      actions.setTestCases(testCases);
      return;
    }

    const file = actions.getUploadedFile();
    if (!file) {
      setGenerationError('No uploaded file available to send to the Python engine.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const testCases = await generateTestCasesViaPythonEngine({
        serverUrl,
        file,
        selectedCategories: state.selectedCategories,
        tableTypeConfigs: state.tableTypeConfigs,
        mappingSheetName: state.mappingSheetName,
        joinsSheetName: state.joinsSheetName,
      });
      actions.setTestCases(testCases);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to generate test cases via the Python engine.');
    } finally {
      setIsGenerating(false);
    }
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

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label className="flex items-center justify-between gap-2 text-sm font-medium">
          Use Python/pandas engine to generate
          <input
            type="checkbox"
            checked={usePythonEngine}
            onChange={(e) => {
              setUsePythonEngine(e.target.checked);
              setGenerationError(null);
            }}
          />
        </label>
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          When enabled, your mapping workbook is uploaded to the local server at <code>{serverUrl}</code> (the
          same server AI Assist uses -- change its URL in the AI Assist menu above) and processed there with a
          full pandas re-implementation of this pipeline, instead of staying entirely in your browser.
        </p>
        {generationError && <p className="mt-2 text-xs text-[var(--color-danger)]">{generationError}</p>}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <Button variant="ghost" onClick={() => actions.setStep('preview')} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
        <Button
          disabled={state.selectedCategories.length === 0 || isGenerating}
          onClick={handleGenerate}
          icon={isGenerating ? <Loader2 size={16} className="animate-spin" /> : <ListChecks size={16} />}
        >
          {isGenerating
            ? 'Generating via Python engine…'
            : `Generate ~${totalEstimated} Test Case${totalEstimated === 1 ? '' : 's'}`}
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
