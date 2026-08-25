import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import { buildFieldValidationSql } from '@/lib/generators/transformationSql';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { isEtlSystemField } from '@/lib/etlSystemFields';

const VALUE_TRANSFORM_STRATEGIES = new Set(['CONCAT_EXPRESSION', 'DIRECT_SQL_FUNCTION', 'ARITHMETIC_EXPRESSION', 'DEFAULT_OR_LOOKUP']);

export function generateTransformationValidationTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind === 'dashboard') continue; // no target value to compare against a KPI

    for (const row of rows) {
      if (!row.transformation.trim() || !row.targetField || !row.sourceField) continue;
      if (isEtlSystemField(row.targetField)) continue; // infra-populated (e.g. etl_timestamp), not mapped business logic

      const { sql, isManualReview, classification } = buildFieldValidationSql(row, rows, typeConfig, ctx.allMappingRows);
      if (classification.strategy === 'DIRECT_COPY') continue;
      if (!VALUE_TRANSFORM_STRATEGIES.has(classification.strategy)) continue;

      testCases.push({
        id: nextDraftId(),
        name: `Transformation Validation: ${targetTable}.${row.targetField}`,
        category: 'TRANSFORMATION_VALIDATION',
        priority: 'P2',
        description: `Confirms the transformation rule for ${row.targetField} ("${row.transformation}") produces the expected value in ${targetTable}.`,
        steps: isManualReview
          ? [
              `Run the source query against \`${row.sourceTable}\` to see the raw values feeding this field.`,
              `Run the target query against \`${targetTable}\` to see the actual loaded values.`,
            ]
          : [
              `Run the source query against \`${row.sourceTable}\` — derived_target_value is what the transformation should produce.`,
              `Run the target query against \`${targetTable}\` — actual_target_value is what was actually loaded.`,
              'Match rows by key across both result sets and compare derived_target_value to actual_target_value.',
            ],
        expectedResult: 'For every row, actual_target_value (target query) equals derived_target_value (source query).',
        sql,
        targetTable,
        sourceMappingRowIds: [row.id],
        isManualReview,
      });
    }
  }

  return testCases;
}
