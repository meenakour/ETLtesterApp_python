import { describe, expect, it } from 'vitest';
import { generateSchemaValidationTests } from '@/lib/generators/schemaValidationGenerator';
import { makeMappingRow, buildContext } from '@/lib/generators/testHelpers';
import { DEFAULT_TABLE_TYPE_CONFIG } from '@/types/tableTypeConfig';

describe('generateSchemaValidationTests', () => {
  it('generates a schema check for a normal table target by default', () => {
    const rows = [makeMappingRow({ targetTable: 'customers', targetField: 'email', targetDatatype: 'VARCHAR(100)' })];
    const testCases = generateSchemaValidationTests(buildContext(rows));
    expect(testCases).toHaveLength(1);
  });

  it('regression: skips a file-target group (information_schema does not apply to a file)', () => {
    const rows = [makeMappingRow({ targetTable: 'landing_file', targetField: 'email', targetDatatype: 'VARCHAR(100)' })];
    const config = { ...DEFAULT_TABLE_TYPE_CONFIG, targetKind: 'file' as const };
    const testCases = generateSchemaValidationTests(buildContext(rows, [], { landing_file: config }));
    expect(testCases).toEqual([]);
  });

  it('regression: skips a dashboard-target group', () => {
    const rows = [makeMappingRow({ targetTable: 'revenue_kpi', targetField: 'total_revenue', targetDatatype: 'DECIMAL(12,2)' })];
    const config = { ...DEFAULT_TABLE_TYPE_CONFIG, targetKind: 'dashboard' as const };
    const testCases = generateSchemaValidationTests(buildContext(rows, [], { revenue_kpi: config }));
    expect(testCases).toEqual([]);
  });
});
