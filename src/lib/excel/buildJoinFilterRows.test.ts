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

  it('regression: resolves a filter-section row\'s leading token through the alias documented in the joins section, when the cells combine schema.table + alias (e.g. "schema.t_cvr_sbscr cvr_sbscr")', () => {
    // Real mapping docs commonly write join participants as "schema.table alias" so the JOIN
    // CONDITION text can reference the short alias directly. A standalone filter row underneath
    // does the same ("cvr_sbscr.end_dt = ..."), but "cvr_sbscr" there is the ALIAS, not the real
    // table name ("t_cvr_sbscr") -- without alias resolution the filter would attach to a
    // nonexistent table "cvr_sbscr" and never show up in that table's actual row-count/scope query.
    const sheet = makeSheet(
      ['Table1', 'table2', 'join', 'condition'],
      [
        {
          Table1: 'analytics_customer_ddz.t_indv_cust indv_cust',
          table2: 'analytics_policy_ddz.t_cvr_sbscr cvr_sbscr',
          join: 'INNER',
          condition: 'indv_cust.id = cvr_sbscr.cust_id',
        },
        { Table1: '', table2: '', join: '', condition: '' },
        { Table1: 'filter', table2: '', join: '', condition: '' },
        { Table1: "cvr_sbscr.end_dt ='9999-12-31'", table2: '', join: '', condition: '' },
      ]
    );
    const columns = makeColumns({ tableName: 'Table1', tablesInvolved: 'table2', joinType: 'join', joinCondition: 'condition' });

    const rows = buildJoinFilterRows(sheet, columns);
    const filterRow = rows.find((r) => r.filterCondition);
    expect(filterRow?.tableName).toBe('t_cvr_sbscr');
    expect(filterRow?.tablesInvolved).toEqual(['t_cvr_sbscr']);
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
