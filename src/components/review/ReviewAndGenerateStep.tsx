import { useMemo, useState } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { useAppState } from '@/hooks/useAppState';
import { useAiAssist } from '@/hooks/useAiAssist';
import { useMappingData } from '@/hooks/useMappingData';
import { SheetPreviewTable } from '@/components/preview/SheetPreviewTable';
import { ColumnMappingPanel } from '@/components/preview/ColumnMappingPanel';
import { JoinAssociationSummary } from '@/components/preview/JoinAssociationSummary';
import { TableTypeConfigPanel } from '@/components/preview/TableTypeConfigPanel';
import { MappingIssuesList } from '@/components/review/MappingIssuesList';
import { reviewMapping } from '@/lib/mapping/reviewMapping';
import { CategoryCard } from '@/components/categories/CategoryCard';
import { Button } from '@/components/common/Button';
import { REQUIRED_MAPPING_FIELDS, REQUIRED_JOIN_FIELDS, MAPPING_FIELD_LABELS, JOIN_FIELD_LABELS } from '@/types/columnMapping';
import { TEST_CATEGORIES } from '@/types/testCase';
import type { TestCategory } from '@/types/testCase';
import { GENERATORS, runGenerators } from '@/lib/generators';
import { generateTestCasesViaPythonEngine } from '@/lib/pythonEngine';

type Tab = 'mapping' | 'joins' | 'types';

export function ReviewAndGenerateStep() {
  const { state, actions } = useAppState();
  const { requiredFieldsResolved, mappingRows, joinFilterRows, generatorContext } = useMappingData();
  const { serverUrl } = useAiAssist();
  const [tab, setTab] = useState<Tab>('mapping');
  const [usePythonEngine, setUsePythonEngine] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const issues = useMemo(
    () => reviewMapping(mappingRows, joinFilterRows, state.mappingSheet, state.mappingColumns),
    [mappingRows, joinFilterRows, state.mappingSheet, state.mappingColumns]
  );

  // The Source File Location/Name fields only matter once a table is actually configured as a
  // file source or target -- for the (far more common) table-to-table case they're pure clutter,
  // so keep them out of the main mapping panel until a table opts into File on the Source/Target
  // Type tab.
  const anyFileKind = Object.values(state.tableTypeConfigs).some(
    (c) => c.sourceKind === 'file' || c.targetKind === 'file'
  );
  const visibleMappingColumns = anyFileKind
    ? state.mappingColumns
    : state.mappingColumns.filter((c) => c.field !== 'sourceFileLocation' && c.field !== 'sourceFileName');

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === key
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
      }`}
    >
      {label}
    </button>
  );

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

  const toggleCategory = (category: TestCategory) => {
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
    <div className="space-y-8">
      {state.sheetChoiceNeeded && (
        <div className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4">
          <p className="mb-3 text-sm font-medium text-[var(--color-warning)]">
            We couldn't confidently tell which sheet is which — please confirm:
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Mapping sheet
              <select
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
                value={state.mappingSheetName ?? ''}
                onChange={(e) => actions.selectMappingSheet(e.target.value)}
              >
                {state.workbookSheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Joins &amp; filters sheet
              <select
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
                value={state.joinsSheetName ?? ''}
                onChange={(e) => actions.selectJoinsSheet(e.target.value)}
              >
                <option value="">-- None --</option>
                {state.workbookSheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <MappingIssuesList issues={issues} />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">1. Review mapping</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Confirm column detection and table/source-target types before generating.
            </p>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {mappingRows.length} mapping row{mappingRows.length === 1 ? '' : 's'} parsed
          </p>
        </div>

        <div className="flex gap-2">
          {tabBtn('mapping', 'Mapping Sheet')}
          {tabBtn('joins', 'Joins & Filters Sheet')}
          {tabBtn('types', 'Source/Target Type')}
        </div>

        {tab === 'mapping' && (
          <div className="space-y-4">
            {state.mappingSheet ? (
              <>
                <SheetPreviewTable sheet={state.mappingSheet} />
                <ColumnMappingPanel
                  columns={visibleMappingColumns}
                  headers={state.mappingSheet.headers}
                  fieldLabels={MAPPING_FIELD_LABELS}
                  requiredFields={REQUIRED_MAPPING_FIELDS}
                  onOverride={actions.overrideMappingColumn}
                />
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No mapping sheet selected.</p>
            )}
          </div>
        )}

        {tab === 'joins' && (
          <div className="space-y-4">
            {state.joinsSheet ? (
              <>
                <SheetPreviewTable sheet={state.joinsSheet} />
                <ColumnMappingPanel
                  columns={state.joinColumns}
                  headers={state.joinsSheet.headers}
                  fieldLabels={JOIN_FIELD_LABELS}
                  requiredFields={REQUIRED_JOIN_FIELDS}
                  onOverride={actions.overrideJoinColumn}
                />
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <h3 className="mb-3 text-sm font-medium">Table Association</h3>
                  <JoinAssociationSummary />
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                No joins &amp; filters sheet detected — row-count and referential-integrity tests will be generated
                without join/filter context.
              </p>
            )}
          </div>
        )}

        {tab === 'types' && (
          <div className="space-y-4">
            <TableTypeConfigPanel />
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-[var(--color-border)] pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">2. Generate test cases</h2>
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
              onToggle={toggleCategory}
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
      </section>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        {!requiredFieldsResolved && (
          <p className="text-sm text-[var(--color-danger)]">
            Please resolve all required fields (marked *) before generating.
          </p>
        )}
        <div className="ml-auto">
          <Button
            disabled={!requiredFieldsResolved || state.selectedCategories.length === 0 || isGenerating}
            onClick={handleGenerate}
            icon={isGenerating ? <Loader2 size={16} className="animate-spin" /> : <ListChecks size={16} />}
          >
            {isGenerating
              ? 'Generating via Python engine…'
              : `Generate ~${totalEstimated} Test Case${totalEstimated === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
