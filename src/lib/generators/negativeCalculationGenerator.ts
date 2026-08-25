import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import type { MappingRow } from '@/types/mapping';
import { quoteColumn } from '@/lib/sql/identifierQuoting';
import { primaryJoinsForTable } from '@/lib/excel/associateJoins';
import { buildFromClause } from '@/lib/sql/sqlSnippets';
import { classifyDatatype } from '@/lib/datatype';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { resolveSourceReference, resolveTargetReference } from '@/lib/sql/sourceReference';

const AGGREGATION_PATTERN = /\b(sum|avg|average|count|min|max)\s*\(/i;
const GROUP_BY_PATTERN = /\bgroup\s+by\b/i;
// Note: "ratio" has no leading \b — an underscore (as in "discount_ratio") is a word character,
// so a boundary wouldn't exist there and the match would silently fail. "_rate" keeps a literal
// leading underscore instead (not \b) so it doesn't false-positive on words like "corporate".
const PERCENT_NAME_PATTERN = /percent|pct|_rate\b|ratio/i;
const PERCENT_EXPR_PATTERN = /%|\/\s*100\b|\*\s*100\b/;
const DIVISION_PATTERN = /([A-Za-z_][\w.]*)\s*\/\s*([A-Za-z_][\w.]*)/;

function findSourceFieldCaseInsensitive(rows: MappingRow[], name: string): MappingRow | undefined {
  const lower = name.toLowerCase();
  return rows.find((r) => r.sourceField.toLowerCase() === lower);
}

function isAggregationTransform(text: string): boolean {
  return AGGREGATION_PATTERN.test(text) || GROUP_BY_PATTERN.test(text);
}

/**
 * Generates negative/boundary test cases for calculation-heavy transformations:
 * division-by-zero and out-of-range percentage/ratio checks, NULL-handling in
 * aggregations, and join fan-out risk when an aggregation is fed by a joined source.
 * These are heuristic (keyword/pattern-based) — like the business-rule classifier,
 * they surface likely risk areas rather than exhaustively proving correctness.
 */
export function generateNegativeCalculationTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind === 'dashboard') continue; // no target value to check here

    const targetSchema = rows.find((r) => r.targetSchema)?.targetSchema;
    const sourceSchema = rows.find((r) => r.sourceSchema)?.sourceSchema;
    const sourceTable = rows.find((r) => r.sourceTable)?.sourceTable;
    const qualifiedTgt = resolveTargetReference(typeConfig, targetSchema, targetTable);
    const qualifiedSrc = sourceTable ? resolveSourceReference(typeConfig, rows, sourceSchema, sourceTable) : null;

    for (const row of rows) {
      const text = row.transformation.trim();
      if (!text || !row.targetField) continue;

      const divisionMatch = text.match(DIVISION_PATTERN);
      if (divisionMatch && qualifiedSrc) {
        const numeratorToken = divisionMatch[1].split('.').pop()!;
        const denominatorToken = divisionMatch[2].split('.').pop()!;
        const numeratorRow = findSourceFieldCaseInsensitive(rows, numeratorToken);
        const denominatorRow = findSourceFieldCaseInsensitive(rows, denominatorToken);

        // Only trust this as a real division formula when BOTH sides resolve to known source
        // fields -- otherwise it's likely incidental text (e.g. a "Customer/Group" label) that
        // happens to contain a slash, not an actual division, and we must not fabricate a query
        // against columns that don't exist.
        if (numeratorRow && denominatorRow) {
          const denominatorField = denominatorRow.sourceField;
          const denominatorCol = quoteColumn(denominatorField);

          testCases.push({
            id: nextDraftId(),
            name: `Negative Test (division by zero): ${targetTable}.${row.targetField}`,
            category: 'NEGATIVE_CALCULATION',
            priority: 'P1',
            description: `The transformation for ${row.targetField} ("${text}") divides by ${denominatorField}; confirms the ETL doesn't error or silently misbehave when the denominator is zero.`,
            steps: [
              `Run the query to find source rows where ${denominatorField} = 0.`,
              `If any exist, inspect the corresponding ${targetTable}.${row.targetField} value.`,
              'Confirm it is NULL/0 (or another documented sentinel) rather than a job failure or an infinite/garbage value.',
            ],
            expectedResult: `Rows with ${denominatorField} = 0 produce a defined, documented result in ${row.targetField} — not a job failure or garbage value.`,
            sql: `SELECT COUNT(*) AS zero_denominator_count\nFROM ${qualifiedSrc}\nWHERE ${denominatorCol} = 0;`,
            targetTable,
            sourceMappingRowIds: [row.id],
          });
        }
      }

      const looksLikePercentOrRatio = PERCENT_NAME_PATTERN.test(row.targetField) || PERCENT_EXPR_PATTERN.test(text);
      if (looksLikePercentOrRatio) {
        const isRatio = /ratio/i.test(row.targetField) && !/percent|pct/i.test(row.targetField);
        const upperBound = isRatio ? 1 : 100;

        testCases.push({
          id: nextDraftId(),
          name: `Negative Test (out-of-range ${isRatio ? 'ratio' : 'percentage'}): ${targetTable}.${row.targetField}`,
          category: 'NEGATIVE_CALCULATION',
          priority: 'P2',
          description: `${row.targetField} is a ${isRatio ? 'ratio' : 'percentage'}-style field derived from "${text}"; confirms values fall within the expected 0-${upperBound} range.`,
          steps: [
            'Run the range-check query.',
            `Confirm out_of_range_count is 0 (adjust the bounds if this field legitimately allows values outside 0-${upperBound}).`,
          ],
          expectedResult: `out_of_range_count is 0 — all values fall within 0-${upperBound}.`,
          sql: `SELECT COUNT(*) AS out_of_range_count\nFROM ${qualifiedTgt}\nWHERE ${quoteColumn(row.targetField)} < 0 OR ${quoteColumn(row.targetField)} > ${upperBound};`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }

      if (isAggregationTransform(text) && qualifiedSrc && row.sourceField) {
        testCases.push({
          id: nextDraftId(),
          name: `Negative Test (NULL handling in aggregation): ${targetTable}.${row.targetField}`,
          category: 'NEGATIVE_CALCULATION',
          priority: 'P2',
          description: `The transformation for ${row.targetField} ("${text}") aggregates values; confirms NULLs in the source field are handled per business-rule expectations (Spark SQL aggregate functions ignore NULLs by default).`,
          steps: [
            'Run the query to count NULLs in the source field feeding this aggregation.',
            `If any exist, confirm ${row.targetField} reflects the intended NULL-handling (excluded vs. treated as zero).`,
          ],
          expectedResult: 'The aggregated value in the target matches the documented NULL-handling behavior for this transformation.',
          sql: `SELECT COUNT(*) AS null_input_count\nFROM ${qualifiedSrc}\nWHERE ${quoteColumn(row.sourceField)} IS NULL;`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }
    }

    const hasAggregation = rows.some((r) => isAggregationTransform(r.transformation));
    if (hasAggregation && qualifiedSrc && sourceTable) {
      const relevantJoins = primaryJoinsForTable(ctx.joinIndex, sourceTable);
      if (relevantJoins.length > 0) {
        const fromClause = buildFromClause(qualifiedSrc, relevantJoins);
        testCases.push({
          id: nextDraftId(),
          name: `Negative Test (join fan-out risk): ${targetTable}`,
          category: 'NEGATIVE_CALCULATION',
          priority: 'P1',
          description: `${targetTable} has an aggregation-based transformation fed by a joined source; confirms the join doesn't multiply rows (fan-out) and inflate the aggregate.`,
          steps: [
            `Compare base_row_count (unjoined ${sourceTable}) against joined_row_count below.`,
            'A joined count that is a large multiple of the base count indicates fan-out — investigate before trusting the aggregation.',
          ],
          expectedResult: 'joined_row_count is not an unexpected multiple of base_row_count (no fan-out inflating the aggregation).',
          sql: `-- Unjoined row count\nSELECT COUNT(*) AS base_row_count FROM ${qualifiedSrc};\n\n-- Joined row count (as used by the aggregation)\nSELECT COUNT(*) AS joined_row_count\n${fromClause};`,
          targetTable,
          sourceMappingRowIds: rows.map((r) => r.id),
        });
      }
    }
  }

  return testCases;
}
