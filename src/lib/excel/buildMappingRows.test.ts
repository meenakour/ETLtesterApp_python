import { describe, expect, it } from 'vitest';
import { buildMappingRows } from '@/lib/excel/buildMappingRows';
import type { SheetData } from '@/types/mapping';
import type { DetectedColumn, MappingFieldKey } from '@/types/columnMapping';

function makeSheet(rows: Record<string, unknown>[]): SheetData {
  return {
    sheetName: 'Mapping',
    headers: ['Source Field', 'Target Field', 'Source Table', 'Target Table'],
    headerRowIndex: 0,
    rows,
  };
}

function makeColumns(overrides: Partial<Record<MappingFieldKey, string>> = {}): DetectedColumn<MappingFieldKey>[] {
  const base: Record<MappingFieldKey, string | null> = {
    sourceField: 'Source Field',
    targetField: 'Target Field',
    sourceTable: 'Source Table',
    targetTable: 'Target Table',
    sourceSchema: null,
    transformation: null,
    targetSchema: null,
    targetDatatype: null,
    primaryKeyFlag: null,
    nullableFlag: null,
    sourceFileLocation: null,
    sourceFileName: null,
  };
  const merged = { ...base, ...overrides };
  return Object.entries(merged).map(([field, matchedHeader]) => ({
    field: field as MappingFieldKey,
    matchedHeader,
    confidence: matchedHeader ? 1 : 0,
  }));
}

describe('buildMappingRows', () => {
  it('parses a normal single-line mapping row unchanged', () => {
    const sheet = makeSheet([{ 'Source Field': 'customer_id', 'Target Field': 'customer_id', 'Source Table': 'customers', 'Target Table': 'customers' }]);
    const rows = buildMappingRows(sheet, makeColumns());
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceField).toBe('customer_id');
    expect(rows[0].targetField).toBe('customer_id');
  });

  it('regression: splits a cell with an embedded line break into two separate field mappings instead of fusing them', () => {
    const sheet = makeSheet([
      {
        'Source Field': 'group\ncustomer_subscriber_metrics',
        'Target Field': 'group_id\nsubscriber_metrics_value',
        'Source Table': 'subs',
        'Target Table': 'subs_out',
      },
    ]);
    const rows = buildMappingRows(sheet, makeColumns());

    expect(rows).toHaveLength(2);
    expect(rows[0].sourceField).toBe('group');
    expect(rows[0].targetField).toBe('group_id');
    expect(rows[1].sourceField).toBe('customer_subscriber_metrics');
    expect(rows[1].targetField).toBe('subscriber_metrics_value');

    // Neither split field name contains a stray embedded newline.
    for (const row of rows) {
      expect(row.sourceField).not.toMatch(/[\r\n]/);
      expect(row.targetField).not.toMatch(/[\r\n]/);
    }

    // Shared (non-split) fields are repeated identically across both split rows.
    expect(rows[0].sourceTable).toBe('subs');
    expect(rows[1].sourceTable).toBe('subs');
    expect(rows[0].targetTable).toBe('subs_out');
    expect(rows[1].targetTable).toBe('subs_out');

    // IDs stay unique across the split rows.
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('reuses the single value on the shorter side when only one side of the cell has multiple lines', () => {
    const sheet = makeSheet([
      {
        'Source Field': 'first_name\nlast_name',
        'Target Field': 'full_name',
        'Source Table': 'customers',
        'Target Table': 'customers',
      },
    ]);
    const rows = buildMappingRows(sheet, makeColumns());

    expect(rows).toHaveLength(2);
    expect(rows[0].sourceField).toBe('first_name');
    expect(rows[1].sourceField).toBe('last_name');
    expect(rows[0].targetField).toBe('full_name');
    expect(rows[1].targetField).toBe('full_name');
  });

  it('collapses stray internal whitespace in non-split fields', () => {
    const sheet = makeSheet([
      { 'Source Field': 'amount', 'Target Field': 'amount', 'Source Table': 'orders   raw', 'Target Table': 'orders' },
    ]);
    const rows = buildMappingRows(sheet, makeColumns());
    expect(rows[0].sourceTable).toBe('orders raw');
  });

  it('regression: keeps only the first table when Source Table lists more than one (e.g. "srctb1 ,srctb2" for a transformation drawing from both)', () => {
    // A raw compound value like this can't be used as a single SQL identifier -- the FROM clause
    // needs one physical table, and any additional tables are expected to be documented as joins
    // in the joins sheet instead (which is how their row-count/referential-integrity checks
    // already attach).
    const sheet = makeSheet([
      { 'Source Field': 'column_1,att_1', 'Target Field': 'field_1', 'Source Table': 'srctb1 ,srctb2', 'Target Table': 'trtable' },
    ]);
    const rows = buildMappingRows(sheet, makeColumns());
    expect(rows[0].sourceTable).toBe('srctb1');
  });

  it('leaves a normal single Source Table value unaffected', () => {
    const sheet = makeSheet([
      { 'Source Field': 'amount', 'Target Field': 'amount', 'Source Table': 'orders_raw', 'Target Table': 'orders' },
    ]);
    const rows = buildMappingRows(sheet, makeColumns());
    expect(rows[0].sourceTable).toBe('orders_raw');
  });

  it('regression: a blank cell in a matched Nullable Flag column defaults to nullable, the same as the column being entirely absent -- rather than fabricating a NOT NULL constraint the doc never asserted', () => {
    const sheet = makeSheet([
      { 'Source Field': 'a', 'Target Field': 'a', 'Source Table': 't', 'Target Table': 't', Null: '' },
      { 'Source Field': 'b', 'Target Field': 'b', 'Source Table': 't', 'Target Table': 't', Null: 'N' },
      { 'Source Field': 'c', 'Target Field': 'c', 'Source Table': 't', 'Target Table': 't', Null: 'Y' },
    ]);
    const rows = buildMappingRows(sheet, makeColumns({ nullableFlag: 'Null' }));
    expect(rows[0].isNullable).toBe(true); // blank -- unspecified, not an explicit "not nullable"
    expect(rows[1].isNullable).toBe(false); // explicit "N"
    expect(rows[2].isNullable).toBe(true); // explicit "Y"
  });

  it('regression: a blank cell in a matched inverted (e.g. "Mandatory") column also defaults to nullable', () => {
    const sheet = makeSheet([{ 'Source Field': 'a', 'Target Field': 'a', 'Source Table': 't', 'Target Table': 't', Mandatory: '' }]);
    const columns = makeColumns({ nullableFlag: 'Mandatory' }).map((c) =>
      c.field === 'nullableFlag' ? { ...c, inverted: true } : c
    );
    const rows = buildMappingRows(sheet, columns);
    expect(rows[0].isNullable).toBe(true);
  });
});
