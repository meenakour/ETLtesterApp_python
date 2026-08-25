import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import { qualifiedTable } from '@/lib/sql/identifierQuoting';
import { getTableTypeConfig } from '@/types/tableTypeConfig';

export function generateSchemaValidationTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    // information_schema only applies to a real database table -- not a file or a dashboard KPI.
    if (getTableTypeConfig(ctx.tableTypeConfigs, targetTable).targetKind !== 'table') continue;

    const targetSchema = rows.find((r) => r.targetSchema)?.targetSchema;
    const fieldsWithDatatype = rows.filter((r) => r.targetField && r.targetDatatype);
    if (fieldsWithDatatype.length === 0) continue;

    const expectedTable = fieldsWithDatatype
      .map((r) => `  ${r.targetField.padEnd(30)} expected: ${r.targetDatatype}, nullable: ${r.isNullable ? 'Y' : 'N'}`)
      .join('\n');

    const sql = [
      `-- Verify column datatypes and nullability for ${targetTable} (Unity Catalog information_schema)`,
      `SELECT column_name, data_type, is_nullable`,
      `FROM information_schema.columns`,
      `WHERE table_schema = '${targetSchema ?? ''}' AND table_name = '${targetTable}'`,
      `ORDER BY ordinal_position;`,
      '',
      `-- Fallback if information_schema is unavailable:`,
      `-- DESCRIBE TABLE ${qualifiedTable(targetSchema, targetTable)};`,
    ].join('\n');

    testCases.push({
      id: nextDraftId(),
      name: `Schema & Datatype Validation: ${targetTable}`,
      category: 'SCHEMA_DATATYPE_VALIDATION',
      priority: 'P1',
      description: `Confirms every mapped column in ${targetTable} has the datatype and nullability declared in the mapping document.`,
      steps: [
        `Run the schema query against \`${targetTable}\`.`,
        'Compare each returned column against the expected values below.',
        `Expected columns:\n${expectedTable}`,
      ],
      expectedResult: 'Every column\'s data_type and is_nullable matches the mapping document; no unmapped/missing columns.',
      sql,
      targetTable,
      sourceMappingRowIds: fieldsWithDatatype.map((r) => r.id),
    });
  }

  return testCases;
}
