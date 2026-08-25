import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import { qualifiedTable, quoteColumn } from '@/lib/sql/identifierQuoting';
import { isCriticalDataElement } from '@/lib/cde';
import { getTableTypeConfig } from '@/types/tableTypeConfig';

export function generatePkNullUniquenessTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    // PK/uniqueness/not-null checks only make sense against a real queryable database table.
    if (getTableTypeConfig(ctx.tableTypeConfigs, targetTable).targetKind !== 'table') continue;

    const targetSchema = rows.find((r) => r.targetSchema)?.targetSchema;
    const qualified = qualifiedTable(targetSchema, targetTable);

    const pkFields = rows.filter((r) => r.isPrimaryKey && r.targetField);
    if (pkFields.length > 0) {
      const pkColumns = pkFields.map((r) => quoteColumn(r.targetField)).join(', ');
      const sql = [
        `-- Primary key uniqueness check for ${targetTable}`,
        `SELECT ${pkColumns}, COUNT(*) AS dup_count`,
        `FROM ${qualified}`,
        `GROUP BY ${pkColumns}`,
        `HAVING COUNT(*) > 1;`,
      ].join('\n');

      testCases.push({
        id: nextDraftId(),
        name: `Primary Key Uniqueness: ${targetTable}`,
        category: 'PK_NULL_UNIQUENESS',
        priority: 'P1',
        description: `Confirms the primary key (${pkFields.map((r) => r.targetField).join(', ')}) is unique in ${targetTable} with no duplicate records.`,
        steps: [
          `Run the GROUP BY / HAVING query above against \`${targetTable}\`.`,
          'Confirm the result set is empty.',
        ],
        expectedResult: 'Zero rows returned — no duplicate primary key values exist.',
        sql,
        targetTable,
        sourceMappingRowIds: pkFields.map((r) => r.id),
      });
    }

    const notNullFields = rows.filter((r) => r.targetField && !r.isNullable);
    if (notNullFields.length > 0) {
      const nullChecks = notNullFields
        .map(
          (r) =>
            `-- ${r.targetField} must not contain NULLs\nSELECT COUNT(*) AS null_violation_count_${r.targetField.replace(/\W+/g, '_')}\nFROM ${qualified}\nWHERE ${quoteColumn(r.targetField)} IS NULL;`
        )
        .join('\n\n');

      testCases.push({
        id: nextDraftId(),
        name: `NOT NULL Validation: ${targetTable}`,
        category: 'PK_NULL_UNIQUENESS',
        priority: 'P1',
        description: `Confirms fields flagged as non-nullable in the mapping document (${notNullFields.map((r) => r.targetField).join(', ')}) contain no NULLs in ${targetTable}.`,
        steps: notNullFields.map((r) => `Run the null-check query for \`${r.targetField}\` and confirm the count is 0.`),
        expectedResult: 'null_violation_count is 0 for every checked field.',
        sql: nullChecks,
        targetTable,
        sourceMappingRowIds: notNullFields.map((r) => r.id),
      });
    }

    // CDE safety net: fields flagged nullable in the doc but that are Critical Data Elements
    // (financial/status/identifier fields) still get an explicit not-null check — the doc's
    // nullable flag may simply be wrong or incomplete, and CDEs deserve extra scrutiny.
    const cdeNullableFields = rows.filter((r) => r.targetField && r.isNullable && isCriticalDataElement(r.targetField));
    if (cdeNullableFields.length > 0) {
      const cdeChecks = cdeNullableFields
        .map(
          (r) =>
            `-- CDE ${r.targetField} is flagged nullable in the mapping doc — verify NULLs are genuinely acceptable\nSELECT COUNT(*) AS cde_null_count_${r.targetField.replace(/\W+/g, '_')}\nFROM ${qualified}\nWHERE ${quoteColumn(r.targetField)} IS NULL;`
        )
        .join('\n\n');

      testCases.push({
        id: nextDraftId(),
        name: `CDE Not-Null Enforcement: ${targetTable}`,
        category: 'PK_NULL_UNIQUENESS',
        priority: 'P1',
        isCde: true,
        description: `${cdeNullableFields.map((r) => r.targetField).join(', ')} ${cdeNullableFields.length > 1 ? 'are' : 'is'} Critical Data Element(s) flagged nullable in the mapping document; confirms NULLs are a genuine business exception rather than a mapping oversight.`,
        steps: cdeNullableFields.map(
          (r) => `Run the null-check query for CDE field \`${r.targetField}\` and confirm the count is 0, or is an explicitly approved exception.`
        ),
        expectedResult: 'cde_null_count is 0 for every checked CDE field, unless a documented business exception applies.',
        sql: cdeChecks,
        targetTable,
        sourceMappingRowIds: cdeNullableFields.map((r) => r.id),
      });
    }
  }

  return testCases;
}
