import { describe, expect, it } from 'vitest';
import { generateNegativeCalculationTests } from '@/lib/generators/negativeCalculationGenerator';
import type { JoinFilterRow } from '@/types/mapping';
import { makeMappingRow, buildContext } from '@/lib/generators/testHelpers';

describe('generateNegativeCalculationTests', () => {
  it('generates a division-by-zero check when the transformation divides by a known source field', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'order_items',
        sourceField: 'completed_count',
        targetTable: 'orders_summary',
        targetField: 'completion_pct',
        transformation: 'completed_count / total_count * 100',
      }),
      makeMappingRow({ sourceTable: 'order_items', sourceField: 'total_count', targetTable: 'orders_summary', targetField: 'total_count_out' }),
    ];
    const testCases = generateNegativeCalculationTests(buildContext(rows));

    const divByZero = testCases.find((tc) => tc.name.includes('division by zero'));
    expect(divByZero).toBeDefined();
    expect(divByZero!.priority).toBe('P1');
    expect(divByZero!.sql).toContain('total_count');
    expect(divByZero!.sql).toContain('= 0');
  });

  it('generates an out-of-range percentage check for a percent-style field', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'order_items',
        sourceField: 'completed_count',
        targetTable: 'orders_summary',
        targetField: 'completion_pct',
        transformation: 'completed_count / total_count * 100',
      }),
    ];
    const testCases = generateNegativeCalculationTests(buildContext(rows));
    const rangeCheck = testCases.find((tc) => tc.name.includes('out-of-range percentage'));
    expect(rangeCheck).toBeDefined();
    expect(rangeCheck!.sql).toContain('> 100');
  });

  it('regression: detects a ratio field named with an underscore suffix (e.g. discount_ratio)', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'order_items',
        sourceField: 'discount',
        targetTable: 'orders_summary',
        targetField: 'discount_ratio',
        transformation: 'discount / list_price',
      }),
      makeMappingRow({ sourceTable: 'order_items', sourceField: 'list_price', targetTable: 'orders_summary', targetField: 'list_price_out' }),
    ];
    const testCases = generateNegativeCalculationTests(buildContext(rows));
    const rangeCheck = testCases.find((tc) => tc.name.includes('out-of-range ratio'));
    expect(rangeCheck).toBeDefined();
    expect(rangeCheck!.sql).toContain('> 1');
    expect(rangeCheck!.sql).not.toContain('> 100');
  });

  it('generates a NULL-handling check for an aggregation transformation', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'order_items',
        sourceField: 'amount',
        targetTable: 'orders_summary',
        targetField: 'total_amount',
        transformation: 'SUM(amount)',
      }),
    ];
    const testCases = generateNegativeCalculationTests(buildContext(rows));
    const nullCheck = testCases.find((tc) => tc.name.includes('NULL handling in aggregation'));
    expect(nullCheck).toBeDefined();
    expect(nullCheck!.sql).toContain('IS NULL');
  });

  it('generates a join fan-out check only when the aggregation source table has a documented join', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'order_items',
        sourceField: 'amount',
        targetTable: 'orders_summary',
        targetField: 'total_amount',
        transformation: 'SUM(amount)',
      }),
    ];

    const withoutJoin = generateNegativeCalculationTests(buildContext(rows));
    expect(withoutJoin.some((tc) => tc.name.includes('fan-out'))).toBe(false);

    const joinRows: JoinFilterRow[] = [
      {
        id: 'j1',
        tableName: 'order_items',
        joinType: 'INNER',
        joinCondition: 'order_items.product_id = products.product_id',
        tablesInvolved: ['order_items', 'products'],
        rawRow: {},
        sheetRowNumber: 2,
      },
    ];
    const withJoin = generateNegativeCalculationTests(buildContext(rows, joinRows));
    const fanOut = withJoin.find((tc) => tc.name.includes('fan-out'));
    expect(fanOut).toBeDefined();
    expect(fanOut!.priority).toBe('P1');
    expect(fanOut!.sql).toContain('base_row_count');
    expect(fanOut!.sql).toContain('joined_row_count');
  });

  it('regression: does not fabricate a division-by-zero check when the "/" is incidental text, not a real division formula', () => {
    // "Customer/Group" here is a categorical label, not a division of two real source columns --
    // neither "Customer" nor "Group" exists as a source field in this table group.
    const rows = [
      makeMappingRow({
        sourceTable: 'accounts',
        sourceField: 'account_type',
        targetTable: 'accounts_summary',
        targetField: 'account_type',
        transformation: "Map to 'Customer/Group' classification label",
      }),
    ];
    const testCases = generateNegativeCalculationTests(buildContext(rows));
    expect(testCases.some((tc) => tc.name.includes('division by zero'))).toBe(false);
  });

  it('generates no negative-calculation cases when no transformation involves %, ratios, or aggregation', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'customers',
        sourceField: 'email',
        targetTable: 'customers',
        targetField: 'email',
        transformation: '',
      }),
    ];
    expect(generateNegativeCalculationTests(buildContext(rows))).toEqual([]);
  });
});
