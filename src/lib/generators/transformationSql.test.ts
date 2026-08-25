import { describe, expect, it } from 'vitest';
import { buildFieldValidationSql } from '@/lib/generators/transformationSql';
import { makeMappingRow } from '@/lib/generators/testHelpers';
import { DEFAULT_TABLE_TYPE_CONFIG } from '@/types/tableTypeConfig';

describe('buildFieldValidationSql known-field scope', () => {
  it('regression: classifies a CONCAT referencing a sibling source field mapped to a DIFFERENT target row, not just this row\'s own source field', () => {
    const concatRow = makeMappingRow({
      sourceTable: 'customers_raw',
      sourceField: 'first_name',
      targetTable: 'customers',
      targetField: 'full_name',
      transformation: "CONCAT(first_name, ' ', last_name)",
    });
    // "last_name" is only ever declared as its OWN row's source field elsewhere in the sheet --
    // never as this row's source field -- yet the transformation legitimately references it.
    const siblingRow = makeMappingRow({
      sourceTable: 'customers_raw',
      sourceField: 'last_name',
      targetTable: 'customers',
      targetField: 'last_name_display',
    });
    const tableRows = [concatRow, siblingRow];

    const result = buildFieldValidationSql(concatRow, tableRows, DEFAULT_TABLE_TYPE_CONFIG, tableRows);
    expect(result.isManualReview).toBe(false);
    expect(result.classification.strategy).toBe('CONCAT_EXPRESSION');
    expect(result.sql).toContain("CONCAT(s.`first_name`, ' ', s.`last_name`)");
  });

  it('regression: classifies a formula referencing another already-computed TARGET column from the same table group', () => {
    const totalRow = makeMappingRow({
      sourceTable: 'orders_raw',
      sourceField: 'amount',
      targetTable: 'orders',
      targetField: 'order_total',
    });
    const pctRow = makeMappingRow({
      sourceTable: 'orders_raw',
      sourceField: 'discount_amount',
      targetTable: 'orders',
      targetField: 'discount_pct',
      // "order_total" here is a TARGET field name (produced by a sibling row above), not a
      // source field -- the whitelist must recognize it as a legitimate reference.
      transformation: 'discount_amount / order_total * 100',
    });
    const tableRows = [totalRow, pctRow];

    const result = buildFieldValidationSql(pctRow, tableRows, DEFAULT_TABLE_TYPE_CONFIG, tableRows);
    expect(result.isManualReview).toBe(false);
    expect(result.classification.strategy).toBe('ARITHMETIC_EXPRESSION');
  });

  it('still falls back to MANUAL_REVIEW when a transformation references a token that is genuinely unknown anywhere in the doc', () => {
    const row = makeMappingRow({
      sourceTable: 'orders_raw',
      sourceField: 'amount',
      targetTable: 'orders',
      targetField: 'total_with_surcharge',
      transformation: 'amount + totally_undeclared_field',
    });
    const result = buildFieldValidationSql(row, [row], DEFAULT_TABLE_TYPE_CONFIG, [row]);
    expect(result.isManualReview).toBe(true);
  });
});
