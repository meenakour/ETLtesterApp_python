import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import { buildFieldValidationSql } from '@/lib/generators/transformationSql';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { isEtlSystemField } from '@/lib/etlSystemFields';

const BUSINESS_RULE_STRATEGIES = new Set(['CASE_EXPRESSION', 'MANUAL_REVIEW']);

export function generateBusinessRuleTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind === 'dashboard') continue; // no target value to compare against a KPI

    for (const row of rows) {
      if (!row.transformation.trim() || !row.targetField || !row.sourceField) continue;
      if (isEtlSystemField(row.targetField)) continue; // infra-populated (e.g. etl_timestamp), not mapped business logic

      const { sql, isManualReview, classification } = buildFieldValidationSql(row, rows, typeConfig, ctx.allMappingRows);
      if (!BUSINESS_RULE_STRATEGIES.has(classification.strategy)) continue;

      const name = isManualReview
        ? `Business Rule Review: ${targetTable}.${row.targetField}`
        : `Business Rule Validation: ${targetTable}.${row.targetField}`;

      const description = isManualReview
        ? `The mapping document defines a business rule for ${row.targetField} that could not be automatically translated into SQL: "${row.transformation}". Requires manual translation/review by a tester familiar with the source system.`
        : `Confirms the conditional business rule for ${row.targetField} ("${row.transformation}") is correctly applied when loading ${targetTable}.`;

      const expectedResult = isManualReview
        ? 'Not automatically verifiable — a tester must translate the rule above into SQL and confirm target values match, then update this test case.'
        : 'For every row, actual_target_value (target query) equals derived_target_value (source query).';

      testCases.push({
        id: nextDraftId(),
        name,
        category: 'BUSINESS_RULE',
        priority: isManualReview ? 'P1' : 'P2',
        description,
        steps: isManualReview
          ? [
              `Review the raw transformation text: "${row.transformation}".`,
              `Consult the source system / business stakeholders to clarify the intended logic.`,
              `Run the source and target queries below as a starting point, then write the real validation query comparing derived vs. actual values in \`${targetTable}\`.`,
            ]
          : [
              `Run the source query against \`${row.sourceTable}\` — derived_target_value is what the business rule should produce.`,
              `Run the target query against \`${targetTable}\` — actual_target_value is what was actually loaded.`,
              'Match rows by key across both result sets and compare derived_target_value to actual_target_value.',
            ],
        expectedResult,
        sql,
        targetTable,
        sourceMappingRowIds: [row.id],
        isManualReview,
      });
    }
  }

  return testCases;
}
