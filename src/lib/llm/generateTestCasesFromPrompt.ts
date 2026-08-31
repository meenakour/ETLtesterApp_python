/**
 * Client for the optional AI Assist backend's prompt-driven test-case generator (see
 * server/index.js's POST /api/generate-test-cases-from-prompt). Distinct from aiAssist.ts, which
 * only ever translates an EXISTING Manual Review case's transformation into one SQL expression --
 * this proposes wholly new test cases from a tester's free-text request. Every proposal is still
 * advisory: the caller (ManualAiReviewPanel.tsx) re-validates the SQL via isSafeGeneratedSql
 * before ever showing it, and nothing here is trusted or merged automatically -- approval is a
 * separate, explicit user action.
 */

import type { Priority, TestCategory } from '@/types/testCase';

const VALID_CATEGORIES = new Set<TestCategory>([
  'ROW_COUNT_RECONCILIATION',
  'SCHEMA_DATATYPE_VALIDATION',
  'PK_NULL_UNIQUENESS',
  'TRANSFORMATION_VALIDATION',
  'EDGE_CASE_DATATYPE',
  'DQ_CHECKS',
  'BUSINESS_RULE',
  'NEGATIVE_CALCULATION',
  'DASHBOARD_KPI_VALIDATION',
]);
const VALID_PRIORITIES = new Set<Priority>(['P1', 'P2', 'P3']);

export interface ProposedTestCase {
  name: string;
  category: TestCategory;
  priority: Priority;
  description: string;
  steps: string[];
  expectedResult: string;
  sql: string;
  targetTable: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateTestCasesRequest {
  prompt: string;
  targetTables: string[];
  knownFieldsByTable: Record<string, string[]>;
}

export type GenerateTestCasesResult =
  | { ok: true; testCases: ProposedTestCase[]; usage: TokenUsage }
  | { ok: false; error: string };

export function isValidProposedTestCase(item: unknown): item is ProposedTestCase {
  if (!item || typeof item !== 'object') return false;
  const tc = item as Record<string, unknown>;
  return (
    typeof tc.name === 'string' &&
    tc.name.trim().length > 0 &&
    VALID_CATEGORIES.has(tc.category as TestCategory) &&
    VALID_PRIORITIES.has(tc.priority as Priority) &&
    typeof tc.description === 'string' &&
    Array.isArray(tc.steps) &&
    tc.steps.every((s) => typeof s === 'string') &&
    typeof tc.expectedResult === 'string' &&
    typeof tc.sql === 'string' &&
    tc.sql.trim().length > 0 &&
    typeof tc.targetTable === 'string' &&
    tc.targetTable.trim().length > 0
  );
}

export async function generateTestCasesFromPrompt(
  serverUrl: string,
  request: GenerateTestCasesRequest
): Promise<GenerateTestCasesResult> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/generate-test-cases-from-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `Server responded ${res.status}` };
    }

    const body = await res.json();
    if (!Array.isArray(body.testCases)) {
      return { ok: false, error: 'Unexpected response shape from AI Assist server' };
    }

    const testCases = body.testCases.filter(isValidProposedTestCase);
    const usage: TokenUsage = {
      inputTokens: typeof body.usage?.inputTokens === 'number' ? body.usage.inputTokens : 0,
      outputTokens: typeof body.usage?.outputTokens === 'number' ? body.usage.outputTokens : 0,
    };
    return { ok: true, testCases, usage };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error contacting AI Assist server' };
  }
}
