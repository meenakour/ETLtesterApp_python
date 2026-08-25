import type { TestCase } from '@/types/testCase';
import type { GeneratorContext } from '@/lib/generators/types';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { buildKnownFields, buildSourceTargetQueries } from '@/lib/generators/transformationSql';
import { qualifyFieldReferences, isSafeSqlExpression } from '@/lib/generators/businessRuleHeuristics';
import { classifyTransformationWithAi } from '@/lib/llm/aiAssist';

const ELIGIBLE_CATEGORIES = new Set(['TRANSFORMATION_VALIDATION', 'BUSINESS_RULE']);

export function countAiEligibleCases(testCases: TestCase[]): number {
  return testCases.filter((tc) => tc.isManualReview && ELIGIBLE_CATEGORIES.has(tc.category)).length;
}

/**
 * Runs the optional AI Assist backend against every Manual Review Transformation/Business Rule
 * test case, sequentially (to stay gentle on the shared backend/API rate limits), and returns a
 * NEW array with any successfully-translated cases patched in place. A case is only patched when
 * the AI's suggested expression independently passes the same known-field/keyword whitelist the
 * deterministic classifier itself is gated by -- an LLM's own claim of correctness is never
 * trusted on its own, consistent with this app's "never silently emit wrong SQL" design.
 */
export async function enrichManualReviewCasesWithAi(
  testCases: TestCase[],
  ctx: GeneratorContext,
  serverUrl: string,
  onProgress?: (done: number, total: number) => void
): Promise<TestCase[]> {
  const eligible = testCases.filter((tc) => tc.isManualReview && ELIGIBLE_CATEGORIES.has(tc.category));
  const patchedById = new Map<string, TestCase>();

  let done = 0;
  for (const tc of eligible) {
    const row = ctx.allMappingRows.find((r) => r.id === tc.sourceMappingRowIds[0]);
    if (!row) {
      done += 1;
      onProgress?.(done, eligible.length);
      continue;
    }

    const tableRows = ctx.mappingRowsByTargetTable.get(row.targetTable) ?? [row];
    const knownFields = buildKnownFields(tableRows, ctx.allMappingRows);

    const result = await classifyTransformationWithAi(serverUrl, {
      transformation: row.transformation,
      knownFields,
      targetField: row.targetField,
    });

    done += 1;
    onProgress?.(done, eligible.length);

    if (!result.ok || !result.expression) continue;
    if (!isSafeSqlExpression(result.expression, knownFields, false)) continue;

    const qualifiedExpr = qualifyFieldReferences(result.expression, knownFields, 's');
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, row.targetTable);
    const sql = buildSourceTargetQueries(row, tableRows, typeConfig, qualifiedExpr);

    patchedById.set(tc.id, { ...tc, sql, isManualReview: false, isAiSuggested: true });
  }

  return testCases.map((tc) => patchedById.get(tc.id) ?? tc);
}
