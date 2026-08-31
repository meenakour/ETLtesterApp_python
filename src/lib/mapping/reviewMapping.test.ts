import { describe, expect, it } from 'vitest';
import { reviewMapping } from '@/lib/mapping/reviewMapping';
import { makeMappingRow, makeJoin } from '@/lib/generators/testHelpers';
import type { SheetData } from '@/types/mapping';
import type { DetectedColumn, MappingFieldKey } from '@/types/columnMapping';

function makeSheet(headers: string[], rows: Record<string, unknown>[]): SheetData {
  return { sheetName: 'Mapping', headers, headerRowIndex: 0, rows };
}

function makeColumns(overrides: Partial<Record<MappingFieldKey, string>> = {}): DetectedColumn<MappingFieldKey>[] {
  const base: Record<string, string | null> = { sourceField: 'Source Field', targetField: 'Target Field', ...overrides };
  return Object.entries(base).map(([field, matchedHeader]) => ({
    field: field as MappingFieldKey,
    matchedHeader,
    confidence: matchedHeader ? 1 : 0,
  }));
}

describe('reviewMapping', () => {
  it('a clean document produces zero issues', () => {
    const rows = [
      makeMappingRow({ sourceField: 'a', sourceTable: 'src', targetField: 'a', targetTable: 't', isPrimaryKey: true, sheetRowNumber: 2 }),
      makeMappingRow({ sourceField: 'b', sourceTable: 'src', targetField: 'b', targetTable: 't', sheetRowNumber: 3 }),
    ];
    const issues = reviewMapping(rows, [], null, []);
    expect(issues).toEqual([]);
  });

  it('flags a field with no table name (source and target independently)', () => {
    const rows = [
      makeMappingRow({ sourceField: 'a', sourceTable: '', targetField: 'a', targetTable: 't', sheetRowNumber: 2 }),
      makeMappingRow({ sourceField: 'b', sourceTable: 'src', targetField: 'b', targetTable: '', sheetRowNumber: 3 }),
    ];
    const issues = reviewMapping(rows, [], null, []);
    const codes = issues.map((i) => i.code);
    expect(codes.filter((c) => c === 'MISSING_TABLE_NAME')).toHaveLength(2);
    expect(issues.find((i) => i.sheetRowNumbers.includes(2))?.message).toContain('Source Table');
    expect(issues.find((i) => i.sheetRowNumbers.includes(3))?.message).toContain('Target Table');
  });

  it('flags a raw sheet row with neither Source Field nor Target Field filled in (silently dropped by buildMappingRows)', () => {
    const sheet = makeSheet(
      ['Source Field', 'Target Field'],
      [
        { 'Source Field': 'a', 'Target Field': 'a' },
        { 'Source Field': '', 'Target Field': '' },
      ]
    );
    const columns = makeColumns();
    const issues = reviewMapping([], [], sheet, columns);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('DROPPED_ROW');
    expect(issues[0].sheetRowNumbers).toEqual([3]); // headerRowIndex 0 + index 1 + 2
  });

  it('flags duplicate target-field mappings within the same target table', () => {
    const rows = [
      makeMappingRow({ sourceField: 'a', sourceTable: 's', targetField: 'x', targetTable: 't', sheetRowNumber: 2 }),
      makeMappingRow({ sourceField: 'b', sourceTable: 's', targetField: 'x', targetTable: 't', sheetRowNumber: 3 }),
      makeMappingRow({ sourceField: 'c', sourceTable: 's', targetField: 'y', targetTable: 't', sheetRowNumber: 4 }),
    ];
    const issues = reviewMapping(rows, [], null, []);
    const dupes = issues.filter((i) => i.code === 'DUPLICATE_TARGET_FIELD');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].sheetRowNumbers).toEqual([2, 3]);
  });

  it('flags a target table with zero PK fields as informational', () => {
    const rows = [makeMappingRow({ sourceField: 'a', sourceTable: 's', targetField: 'a', targetTable: 't', isPrimaryKey: false, sheetRowNumber: 2 })];
    const issues = reviewMapping(rows, [], null, []);
    const noPk = issues.filter((i) => i.code === 'NO_PRIMARY_KEY');
    expect(noPk).toHaveLength(1);
    expect(noPk[0].severity).toBe('info');
  });

  it('flags near-duplicate table names as a possible typo', () => {
    const rows = [
      makeMappingRow({ sourceField: 'a', sourceTable: 't_indv_cust', targetField: 'a', targetTable: 't', sheetRowNumber: 2 }),
      makeMappingRow({ sourceField: 'b', sourceTable: 't_indv_cst', targetField: 'b', targetTable: 't', sheetRowNumber: 3 }),
    ];
    const issues = reviewMapping(rows, [], null, []);
    expect(issues.some((i) => i.code === 'POSSIBLE_TYPO_TABLE')).toBe(true);
  });

  it('regression: does not flag a table and its legitimately-related detail table (e.g. "t_indv_cust" / "t_indv_cust_mbr") as a typo, even though they share a long common prefix', () => {
    const rows = [
      makeMappingRow({ sourceField: 'a', sourceTable: 't_indv_cust', targetField: 'a', targetTable: 't', sheetRowNumber: 2 }),
      makeMappingRow({ sourceField: 'b', sourceTable: 't_indv_cust_mbr', targetField: 'b', targetTable: 't', sheetRowNumber: 3 }),
    ];
    const issues = reviewMapping(rows, [], null, []);
    expect(issues.some((i) => i.code === 'POSSIBLE_TYPO_TABLE')).toBe(false);
  });

  it('does not flag two genuinely different table names as typos', () => {
    const rows = [
      makeMappingRow({ sourceField: 'a', sourceTable: 'orders', targetField: 'a', targetTable: 't', sheetRowNumber: 2 }),
      makeMappingRow({ sourceField: 'b', sourceTable: 'customers', targetField: 'b', targetTable: 't', sheetRowNumber: 3 }),
    ];
    const issues = reviewMapping(rows, [], null, []);
    expect(issues.some((i) => i.code === 'POSSIBLE_TYPO_TABLE')).toBe(false);
  });

  it('flags a join/filter row referencing a table not found in the mapping sheet', () => {
    const rows = [makeMappingRow({ sourceField: 'a', sourceTable: 'orders', targetField: 'a', targetTable: 't', sheetRowNumber: 2 })];
    const joins = [makeJoin({ tableName: 'nonexistent_table', tablesInvolved: ['nonexistent_table'], joinCondition: 'a.id = b.id', sheetRowNumber: 5 })];
    const issues = reviewMapping(rows, joins, null, []);
    const unknown = issues.filter((i) => i.code === 'UNKNOWN_JOIN_TABLE_REF');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].sheetRowNumbers).toEqual([5]);
  });

  it('does not flag a join/filter row whose table matches a mapping-sheet table', () => {
    const rows = [makeMappingRow({ sourceField: 'a', sourceTable: 'orders', targetField: 'a', targetTable: 't', sheetRowNumber: 2 })];
    const joins = [makeJoin({ tableName: 'orders', tablesInvolved: ['orders', 'customers'], joinCondition: 'a.id = b.id', sheetRowNumber: 5 })];
    const issues = reviewMapping(rows, joins, null, []);
    expect(issues.some((i) => i.code === 'UNKNOWN_JOIN_TABLE_REF')).toBe(false);
  });
});
