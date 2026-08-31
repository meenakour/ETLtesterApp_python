import { useMemo, useState } from 'react';
import { Loader2, Sparkles, Check, X as XIcon } from 'lucide-react';
import { useAppState } from '@/hooks/useAppState';
import { useMappingData } from '@/hooks/useMappingData';
import { useAiAssist } from '@/hooks/useAiAssist';
import type { TestCase } from '@/types/testCase';
import { CATEGORY_LABELS } from '@/types/testCase';
import { buildKnownFields } from '@/lib/generators/transformationSql';
import { generateTestCasesFromPrompt, type ProposedTestCase } from '@/lib/llm/generateTestCasesFromPrompt';
import { isSafeGeneratedSql } from '@/lib/llm/aiGeneratedSqlSafety';
import { nextDraftId } from '@/lib/generators/types';
import { assignNextIdForCategory } from '@/lib/testCaseId';
import { TestCaseTable } from '@/components/results/TestCaseTable';
import { TestCaseDetailPanel } from '@/components/results/TestCaseDetailPanel';
import { SqlCodeBlock } from '@/components/results/SqlCodeBlock';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';

type Mode = 'manual' | 'ai';

function toPendingCase(proposal: ProposedTestCase): TestCase {
  return {
    ...proposal,
    id: nextDraftId(),
    sourceMappingRowIds: [],
    isManualReview: false,
    isAiGenerated: true,
  };
}

export function ManualAiReviewPanel() {
  const { state, actions } = useAppState();
  const { mappingRows, mappingRowsByTargetTable } = useMappingData();
  const { enabled: aiAssistEnabled, serverUrl } = useAiAssist();

  const [mode, setMode] = useState<Mode>('manual');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TestCase | null>(null);

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pendingProposals, setPendingProposals] = useState<TestCase[]>([]);
  const [sessionUsage, setSessionUsage] = useState({ inputTokens: 0, outputTokens: 0, calls: 0 });

  const filtered = useMemo(() => {
    if (!query.trim()) return state.testCases;
    const q = query.toLowerCase();
    return state.testCases.filter((tc) => `${tc.id} ${tc.name} ${tc.targetTable}`.toLowerCase().includes(q));
  }, [state.testCases, query]);

  const modeBtn = (key: Mode, label: string) => (
    <button
      onClick={() => setMode(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        mode === key
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
      }`}
    >
      {label}
    </button>
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const targetTables = [...mappingRowsByTargetTable.keys()];
      const knownFieldsByTable = Object.fromEntries(
        [...mappingRowsByTargetTable.entries()].map(([table, rows]) => [table, buildKnownFields(rows, mappingRows)])
      );
      const result = await generateTestCasesFromPrompt(serverUrl, { prompt, targetTables, knownFieldsByTable });
      if (!result.ok) {
        setGenerateError(result.error);
        return;
      }
      setSessionUsage((prev) => ({
        inputTokens: prev.inputTokens + result.usage.inputTokens,
        outputTokens: prev.outputTokens + result.usage.outputTokens,
        calls: prev.calls + 1,
      }));
      const safe = result.testCases.filter((tc) => isSafeGeneratedSql(tc.sql));
      const withheld = result.testCases.length - safe.length;
      setPendingProposals((prev) => [...prev, ...safe.map(toPendingCase)]);
      setPrompt('');
      if (safe.length === 0 && withheld === 0) {
        setGenerateError('The AI didn\'t propose any test cases for that request -- try rephrasing it.');
      } else if (withheld > 0) {
        setGenerateError(`${withheld} suggestion${withheld === 1 ? '' : 's'} withheld -- failed a safety check.`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = (proposal: TestCase) => {
    const id = assignNextIdForCategory(proposal.category, state.testCases);
    actions.addTestCases([{ ...proposal, id }]);
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposal.id));
  };

  const handleReject = (proposalId: string) => {
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {modeBtn('manual', 'Manual Review')}
        {modeBtn('ai', 'AI Review')}
      </div>

      {mode === 'manual' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Browse every generated test case. Click a row for full details.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by id, name, or target table…"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Showing {filtered.length} of {state.testCases.length}
          </p>
          <TestCaseTable testCases={filtered} onSelect={setSelected} />
        </div>
      )}

      {mode === 'ai' && (
        <div className="space-y-4">
          {!aiAssistEnabled ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
              AI Review needs AI Assist enabled first — open the <strong>AI Assist</strong> menu in the header to turn
              it on and confirm the server connection.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Ask the AI to propose new test cases
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Add a test that checks customer_id never contains whitespace"
                    rows={3}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-normal"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between">
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || !prompt.trim()}
                    icon={generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  >
                    {generating ? 'Generating…' : 'Generate'}
                  </Button>
                  {sessionUsage.calls > 0 && (
                    <span className="text-xs text-[var(--color-text-muted)]" title="Cumulative Anthropic token usage for this session's AI Review requests">
                      {sessionUsage.calls} call{sessionUsage.calls === 1 ? '' : 's'} · {sessionUsage.inputTokens.toLocaleString()} in
                      / {sessionUsage.outputTokens.toLocaleString()} out tokens
                    </span>
                  )}
                </div>
                {generateError && <p className="mt-2 text-xs text-[var(--color-danger)]">{generateError}</p>}
              </div>

              {pendingProposals.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">
                    Pending proposals ({pendingProposals.length}) — review before approving
                  </h3>
                  {pendingProposals.map((proposal) => (
                    <div key={proposal.id} className="rounded-xl border border-[var(--color-accent)] bg-[var(--color-surface)] p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">{CATEGORY_LABELS[proposal.category]}</Badge>
                          <PriorityBadge priority={proposal.priority} />
                          <span className="text-xs text-[var(--color-text-muted)]">{proposal.targetTable}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => handleReject(proposal.id)} icon={<XIcon size={14} />}>
                            Reject
                          </Button>
                          <Button onClick={() => handleApprove(proposal)} icon={<Check size={14} />}>
                            Approve
                          </Button>
                        </div>
                      </div>
                      <p className="mb-1 text-sm font-medium">{proposal.name}</p>
                      <p className="mb-2 text-xs text-[var(--color-text-muted)]">{proposal.description}</p>
                      <SqlCodeBlock sql={proposal.sql} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selected && <TestCaseDetailPanel testCase={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
