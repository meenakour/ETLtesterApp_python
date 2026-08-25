import { describe, expect, it } from 'vitest';
import { buildJoinFilterRows } from '@/lib/excel/buildJoinFilterRows';
import type { SheetData } from '@/types/mapping';
import type { DetectedColumn, JoinFieldKey } from '@/types/columnMapping';

function makeSheet(headers: string[], rows: Record<string, unknown>[]): SheetData {
  return { sheetName: 'joins', headers, headerRowIndex: 0, rows };
}

function makeColumns(mapping: Partial<Record<JoinFieldKey, string>>): DetectedColumn<JoinFieldKey>[] {
  const allFields: JoinFieldKey[] = ['tableName', 'schemaName', 'joinType', 'joinCondition', 'tablesInvolved', 'filterCondition'];
  return allFields.map((field) => ({
    field,
    matchedHeader: mapping[field] ?? null,
    confidence: mapping[field] ? 1 : 0,
  }));
}

describe('buildJoinFilterRows', () => {
  it('regression: unions the row\'s own Table Name into tablesInvolved when the sheet splits the join pair into two separate columns (e.g. "Table1"/"table2") instead of one combined list', () => {
    // This shape -- rather than a single "Tables Involved" column like "orders, customers" -- means
    // the fuzzy matcher only ever picks up the SECOND column as "Tables Involved", so the parsed
    // list would be missing the row's own primary table entirely without this fix.
    const sheet = makeSheet(
      ['Table1', 'table2', 'join', 'condition'],
      [{ Table1: 'srctb1', table2: 'srctb2', join: 'LEFT', condition: 'srctb1.id = srctb2.id' }]
    );
    const columns = makeColumns({ tableName: 'Table1', tablesInvolved: 'table2', joinType: 'join', joinCondition: 'condition' });

    const rows = buildJoinFilterRows(sheet, columns);
    expect(rows).toHaveLength(1);
    expect(rows[0].tableName).toBe('srctb1');
    expect(rows[0].tablesInvolved).toContain('srctb1');
    expect(rows[0].tablesInvolved).toContain('srctb2');
    expect(rows[0].tablesInvolved).toHaveLength(2);
  });

  it('does not duplicate the table name when the sheet already lists it in a combined Tables Involved column', () => {
    const sheet = makeSheet(
      ['Table', 'Tables Involved', 'Join Condition'],
      [{ Table: 'orders', 'Tables Involved': 'orders, customers', 'Join Condition': 'orders.id = customers.id' }]
    );
    const columns = makeColumns({ tableName: 'Table', tablesInvolved: 'Tables Involved', joinCondition: 'Join Condition' });

    const rows = buildJoinFilterRows(sheet, columns);
    expect(rows[0].tablesInvolved).toEqual(['orders', 'customers']);
  });

  it('regression: parses a standalone "filter" section (a literal "filter" label row followed by bare condition strings with no Filter Condition column at all)', () => {
    const sheet = makeSheet(
      ['Table1', 'table2', 'join', 'condition'],
      [
        { Table1: 'srctb1', table2: 'srctb2', join: 'LEFT', condition: 'srctb1.id = srctb2.id' },
        { Table1: '', table2: '', join: '', condition: '' },
        { Table1: 'filter', table2: '', join: '', condition: '' },
        { Table1: 'srctb1.bgn_dt <CURRENT_DATE', table2: '', join: '', condition: '' },
        { Table1: 'srctb2.end_dt >CURRENT_DATE', table2: '', join: '', condition: '' },
      ]
    );
    const columns = makeColumns({ tableName: 'Table1', tablesInvolved: 'table2', joinType: 'join', joinCondition: 'condition' });

    const rows = buildJoinFilterRows(sheet, columns);
    const filterRows = rows.filter((r) => r.filterCondition);
    expect(filterRows).toHaveLength(2);

    const srctb1Filter = filterRows.find((r) => r.tableName === 'srctb1');
    expect(srctb1Filter?.filterCondition).toBe('srctb1.bgn_dt <CURRENT_DATE');
    expect(srctb1Filter?.tablesInvolved).toEqual(['srctb1']);

    const srctb2Filter = filterRows.find((r) => r.tableName === 'srctb2');
    expect(srctb2Filter?.filterCondition).toBe('srctb2.end_dt >CURRENT_DATE');

    // The real join row above the "filter" marker must still parse normally.
    expect(rows.some((r) => r.joinCondition === 'srctb1.id = srctb2.id')).toBe(true);
  });

  it('skips a filter-section row whose condition text has no recognizable leading table reference, rather than guessing', () => {
    const sheet = makeSheet(
      ['Table1', 'table2', 'join', 'condition'],
      [
        { Table1: 'filter', table2: '', join: '', condition: '' },
        { Table1: 'amount > 0', table2: '', join: '', condition: '' }, // no "table." prefix at all
      ]
    );
    const columns = makeColumns({ tableName: 'Table1', tablesInvolved: 'table2', joinType: 'join', joinCondition: 'condition' });

    const rows = buildJoinFilterRows(sheet, columns);
    expect(rows).toHaveLength(0);
  });
});
