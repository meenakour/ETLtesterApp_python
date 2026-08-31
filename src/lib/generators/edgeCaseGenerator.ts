import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import { quoteColumn } from '@/lib/sql/identifierQuoting';
import { classifyDatatype, parseDecimalScale, parseLength } from '@/lib/datatype';
import type { MappingRow } from '@/types/mapping';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { resolveTargetReference } from '@/lib/sql/sourceReference';
import { isEtlSystemField } from '@/lib/etlSystemFields';

interface Check {
  label: string;
  sql: string;
  expectation: string;
}

function stringChecks(row: MappingRow, col: string, table: string): Check[] {
  const checks: Check[] = [
    {
      label: 'whitespace-only values',
      sql: `SELECT COUNT(*) AS whitespace_only_count FROM ${table} WHERE TRIM(${col}) = '' AND ${col} IS NOT NULL;`,
      expectation: 'whitespace_only_count is 0 (no values that are only spaces).',
    },
    {
      label: 'empty string vs. NULL',
      sql: `SELECT COUNT(*) AS empty_string_count FROM ${table} WHERE ${col} = '';`,
      expectation: 'empty_string_count is 0, or a documented/expected value if empty strings are valid for this field.',
    },
  ];
  const length = parseLength(row.targetDatatype);
  if (length) {
    checks.push({
      label: 'length overflow',
      sql: `SELECT COUNT(*) AS length_overflow_count FROM ${table} WHERE LENGTH(${col}) > ${length};`,
      expectation: `length_overflow_count is 0 (no values exceeding the declared length of ${length}).`,
    });
  }
  return checks;
}

function numericChecks(row: MappingRow, col: string, table: string): Check[] {
  const checks: Check[] = [
    {
      label: 'negative values',
      sql: `SELECT COUNT(*) AS negative_value_count FROM ${table} WHERE ${col} < 0;`,
      expectation: 'negative_value_count is 0, unless negative values are expected for this field.',
    },
  ];
  const scale = parseDecimalScale(row.targetDatatype);
  if (scale !== null) {
    checks.push({
      label: 'precision overflow',
      sql: `SELECT COUNT(*) AS precision_overflow_count FROM ${table} WHERE ${col} != ROUND(${col}, ${scale});`,
      expectation: `precision_overflow_count is 0 (no values with more than ${scale} decimal place(s)).`,
    });
  }
  return checks;
}

function dateChecks(row: MappingRow, col: string, table: string): Check[] {
  const checks: Check[] = [];
  // A non-nullable date field's NULL count is already asserted by PK_NULL_UNIQUENESS's own
  // "NOT NULL Validation" test case for this exact field -- repeating it here would just be the
  // same query under a different category. Nullable date fields aren't touched by that check at
  // all, so this remains the only place their NULL count gets surfaced.
  if (row.isNullable) {
    checks.push({
      label: 'null dates',
      sql: `SELECT COUNT(*) AS null_date_count FROM ${table} WHERE ${col} IS NULL;`,
      expectation: 'null_date_count is 0, unless this field is expected to allow NULL dates.',
    });
  }
  checks.push(
    {
      label: 'future dates (adjust if legitimately allowed)',
      sql: `SELECT COUNT(*) AS future_date_count FROM ${table} WHERE ${col} > CURRENT_DATE();`,
      expectation: 'future_date_count is 0, unless future-dated records are valid for this field.',
    },
    {
      label: 'sentinel/default dates',
      sql: `SELECT COUNT(*) AS sentinel_date_count FROM ${table} WHERE ${col} < DATE('1900-01-01');`,
      expectation: 'sentinel_date_count is 0 (no placeholder/default dates leaking through).',
    }
  );
  return checks;
}

function booleanChecks(col: string, table: string): Check[] {
  return [
    {
      label: 'value domain',
      sql: `SELECT DISTINCT ${col} FROM ${table};`,
      expectation: 'Only the expected domain values appear (e.g. true/false, 0/1, Y/N — adjust to the actual domain).',
    },
  ];
}

export function generateEdgeCaseTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind === 'dashboard') continue; // no queryable target to check

    const targetSchema = rows.find((r) => r.targetSchema)?.targetSchema;
    const qualified = resolveTargetReference(typeConfig, targetSchema, targetTable);

    for (const row of rows) {
      if (!row.targetField) continue;
      // ETL/audit columns (etl_timestamp, load_date, batch_id, ...) are infrastructure-populated,
      // not mapped business data -- boundary checks on them are noise, not signal.
      if (isEtlSystemField(row.targetField)) continue;
      const datatype = row.targetDatatype;
      const cls = classifyDatatype(datatype);
      if (cls === 'unknown') continue;

      const col = quoteColumn(row.targetField);
      let checks: Check[] = [];
      if (cls === 'string') checks = stringChecks(row, col, qualified);
      if (cls === 'numeric') checks = numericChecks(row, col, qualified);
      if (cls === 'date') checks = dateChecks(row, col, qualified);
      if (cls === 'boolean') checks = booleanChecks(col, qualified);
      if (checks.length === 0) continue;

      const sql = checks.map((c) => `-- ${c.label}\n${c.sql}`).join('\n\n');

      testCases.push({
        id: nextDraftId(),
        name: `Datatype Boundary Validation (${cls}): ${targetTable}.${row.targetField}`,
        category: 'EDGE_CASE_DATATYPE',
        priority: 'P3',
        description: `Datatype-driven boundary checks for ${row.targetField} (declared as ${datatype || 'unknown type'}) in ${targetTable}.`,
        steps: checks.map((c) => `Check for ${c.label}: run the query and confirm — ${c.expectation}`),
        expectedResult: checks.map((c) => c.expectation).join(' '),
        sql,
        targetTable,
        sourceMappingRowIds: [row.id],
      });
    }
  }

  return testCases;
}
