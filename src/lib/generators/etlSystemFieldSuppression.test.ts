import { describe, expect, it } from 'vitest';
import { generateEdgeCaseTests } from '@/lib/generators/edgeCaseGenerator';
import { generateDqChecks } from '@/lib/generators/dqChecksGenerator';
import { generatePkNullUniquenessTests } from '@/lib/generators/pkNullUniquenessGenerator';
import { makeMappingRow, buildContext } from '@/lib/generators/testHelpers';

describe('ETL system field suppression', () => {
  it('generates no edge-case checks for ETL/audit columns, but still checks a normal business field', () => {
    const rows = [
      makeMappingRow({ targetTable: 'orders', targetField: 'etl_timestamp', targetDatatype: 'TIMESTAMP' }),
      makeMappingRow({ targetTable: 'orders', targetField: 'load_date', targetDatatype: 'DATE' }),
      makeMappingRow({ targetTable: 'orders', targetField: 'order_amount', targetDatatype: 'DECIMAL(10,2)' }),
    ];
    const testCases = generateEdgeCaseTests(buildContext(rows));
    expect(testCases.some((tc) => tc.name.includes('etl_timestamp'))).toBe(false);
    expect(testCases.some((tc) => tc.name.includes('load_date'))).toBe(false);
    expect(testCases.some((tc) => tc.name.includes('order_amount'))).toBe(true);
  });

  it('generates no per-field DQ heuristic checks for a data_quality_check-style field even if it looks email/date-like', () => {
    const rows = [
      makeMappingRow({ targetTable: 'orders', targetField: 'data_quality_check', isPrimaryKey: false }),
      makeMappingRow({ targetTable: 'orders', targetField: 'order_id', isPrimaryKey: true }),
      makeMappingRow({ targetTable: 'orders', targetField: 'customer_email', targetDatatype: 'VARCHAR(100)' }),
    ];
    const testCases = generateDqChecks(buildContext(rows));
    expect(testCases.some((tc) => tc.name.includes('data_quality_check'))).toBe(false);
    expect(testCases.some((tc) => tc.name.includes('customer_email'))).toBe(true);
  });

  it('does not treat batch_id/etl_timestamp as Critical Data Elements needing extra not-null enforcement', () => {
    const rows = [
      makeMappingRow({ targetTable: 'orders', targetField: 'batch_id', isNullable: true }),
      makeMappingRow({ targetTable: 'orders', targetField: 'etl_timestamp', isNullable: true }),
      makeMappingRow({ targetTable: 'orders', targetField: 'account_balance', isNullable: true }),
    ];
    const testCases = generatePkNullUniquenessTests(buildContext(rows));
    const cdeCase = testCases.find((tc) => tc.name.includes('CDE Not-Null Enforcement'));
    expect(cdeCase).toBeDefined();
    expect(cdeCase!.sql).toContain('account_balance');
    expect(cdeCase!.sql).not.toContain('batch_id');
    expect(cdeCase!.sql).not.toContain('etl_timestamp');
  });
});
