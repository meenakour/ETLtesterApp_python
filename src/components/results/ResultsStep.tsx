import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { useAppState } from '@/hooks/useAppState';
import { useMappingData } from '@/hooks/useMappingData';
import { useAiAssist } from '@/hooks/useAiAssist';
import type { TestCase, TestCategory, Priority } from '@/types/testCase';
import { TestCaseSearchFilter } from '@/components/results/TestCaseSearchFilter';
import { TestCaseTable } from '@/components/results/TestCaseTable';
import { TestCaseDetailPanel } from '@/components/results/TestCaseDetailPanel';
import { RtmCategoryGroups } from '@/components/results/RtmCategoryGroups';
import { ManualAiReviewPanel } from '@/components/results/ManualAiReviewPanel';
import { ExportBar } from '@/components/export/ExportBar';
import { Button } from '@/components/common/Button';
import { Pagination } from '@/components/common/Pagination';
import { buildRtm, buildRtmByCategory } from '@/lib/rtm';
import { countAiEligibleCases, enrichManualReviewCasesWithAi } from '@/lib/llm/aiAssistEnrichment';

type View = 'testCases' | 'rtm' | 'review';
const PAGE_SIZE = 10;

export function ResultsStep() {
  const { state, actions } = useAppState();
  const { mappingRows, generatorContext } = useMappingData();
  const { enabled: aiAssistEnabled, serverUrl: aiAssistServerUrl } = useAiAssist();
  const [view, setView] = useState<View>('testCases');
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiLastResult, setAiLastResult] = useState<{ enhanced: number; attempted: number } | null>(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TestCategory | 'ALL'>('ALL');
  const [activePriority, setActivePriority] = useState<Priority | 'ALL'>('ALL');
  const [manualReviewOnly, setManualReviewOnly] = useState(false);
  const [cdeOnly, setCdeOnly] = useState(false);
  const [dashboardOnly, setDashboardOnly] = useState(false);
  const [selected, setSelected] = useState<TestCase | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    return state.testCases.filter((tc) => {
      if (activeCategory !== 'ALL' && tc.category !== activeCategory) return false;
      if (activePriority !== 'ALL' && tc.priority !== activePriority) return false;
      if (manualReviewOnly && !tc.isManualReview) return false;
      if (cdeOnly && !tc.isCde) return false;
      if (dashboardOnly && !tc.isDashboardComparison) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const haystack = `${tc.id} ${tc.name} ${tc.description} ${tc.targetTable}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [state.testCases, activeCategory, activePriority, manualReviewOnly, cdeOnly, dashboardOnly, query]);

  // Reset to page 1 whenever the filtered set changes shape, so we never land on a stale/empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, activePriority, manualReviewOnly, cdeOnly, dashboardOnly, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const aiEligibleCount = useMemo(() => countAiEligibleCases(state.testCases), [state.testCases]);

  const handleEnhanceWithAi = async () => {
    setAiLastResult(null);
    setAiProgress({ done: 0, total: aiEligibleCount });
    const before = new Set(state.testCases.filter((tc) => tc.isManualReview).map((tc) => tc.id));
    const updated = await enrichManualReviewCasesWithAi(state.testCases, generatorContext, aiAssistServerUrl, (done, total) =>
      setAiProgress({ done, total })
    );
    const enhanced = updated.filter((tc) => before.has(tc.id) && !tc.isManualReview).length;
    actions.replaceTestCases(updated);
    setAiProgress(null);
    setAiLastResult({ enhanced, attempted: aiEligibleCount });
  };

  const rtmGroups = useMemo(() => buildRtmByCategory(mappingRows, state.testCases), [mappingRows, state.testCases]);
  const rtmGaps = useMemo(
    () => buildRtm(mappingRows, state.testCases).filter((e) => !e.covered),
    [mappingRows, state.testCases]
  );

  const viewTabBtn = (key: View, label: string) => (
    <button
      onClick={() => setView(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        view === key
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Generated test cases</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Click a row to view its full description, steps and SQL.
          </p>
        </div>
        <Button variant="ghost" onClick={() => actions.setStep('categories')} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
      </div>

      <div className="flex gap-2">
        {viewTabBtn('testCases', 'Test Cases')}
        {viewTabBtn('rtm', `Traceability Matrix (RTM)${rtmGaps.length > 0 ? ` · ${rtmGaps.length} gap${rtmGaps.length === 1 ? '' : 's'}` : ''}`)}
        {viewTabBtn('review', 'Manual & AI Review')}
      </div>

      {view === 'testCases' && (
        <>
          <TestCaseSearchFilter
            query={query}
            onQueryChange={setQuery}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            activePriority={activePriority}
            onPriorityChange={setActivePriority}
            manualReviewOnly={manualReviewOnly}
            onManualReviewOnlyChange={setManualReviewOnly}
            cdeOnly={cdeOnly}
            onCdeOnlyChange={setCdeOnly}
            dashboardOnly={dashboardOnly}
            onDashboardOnlyChange={setDashboardOnly}
          />

          <p className="text-xs text-[var(--color-text-muted)]">
            Showing {paginated.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1}–
            {(pageSafe - 1) * PAGE_SIZE + paginated.length} of {filtered.length}
          </p>

          <TestCaseTable testCases={paginated} onSelect={setSelected} />

          <Pagination currentPage={pageSafe} totalPages={totalPages} onPageChange={setCurrentPage} />

          {aiAssistEnabled && aiEligibleCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <Button
                variant="secondary"
                onClick={handleEnhanceWithAi}
                disabled={aiProgress !== null}
                icon={aiProgress ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              >
                {aiProgress ? `Enhancing ${aiProgress.done}/${aiProgress.total}…` : `Enhance ${aiEligibleCount} Manual Review case${aiEligibleCount === 1 ? '' : 's'} with AI`}
              </Button>
              {aiLastResult && (
                <span className="text-sm text-[var(--color-text-muted)]">
                  {aiLastResult.enhanced} of {aiLastResult.attempted} case{aiLastResult.attempted === 1 ? '' : 's'}{' '}
                  translated to SQL — review each before trusting it.
                </span>
              )}
            </div>
          )}

          <ExportBar testCases={state.testCases} mappingRows={mappingRows} />
        </>
      )}

      {view === 'rtm' && (
        <>
          <p className="text-sm text-[var(--color-text-muted)]">
            Grouped by test category — click a category to see which mapping fields it covers. Gaps (fields with
            no covering test case at all) are always shown separately below.
          </p>
          <RtmCategoryGroups groups={rtmGroups} gaps={rtmGaps} />
        </>
      )}

      {view === 'review' && <ManualAiReviewPanel />}

      {selected && <TestCaseDetailPanel testCase={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
