import { describe, expect, it } from 'vitest';
import { buildJoinIndex, joinsForTable, primaryJoinsForTable, filterMappingRowsBySelection } from '@/lib/excel/associateJoins';
import type { JoinFilterRow, MappingRow } from '@/types/mapping';

function makeJoinRow(overrides: Partial<JoinFilterRow>): JoinFilterRow {
  return {
    id: 'join-0',
    tableName: '',
    tablesInvolved: [],
    rawRow: {},
    sheetRowNumber: 2,
    ...overrides,
  };
}

function makeMappingRow(overrides: Partial<MappingRow>): MappingRow {
  return {
    id: 'row-0',
    sourceField: '',
    sourceTable: '',
    sourceSchema: '',
    transformation: '',
    targetField: '',
    targetTable: '',
    targetSchema: '',
    targetDatatype: '',
    isPrimaryKey: false,
    isNullable: true,
    rawRow: {},
    sheetRowNumber: 2,
    ...overrides,
  };
}

describe('buildJoinIndex / primaryJoinsForTable', () => {
  it('regression: a join documented against one table must not leak into another table\'s primary joins', () => {
    // "orders" documents a join+filter to "customers". A naive index keyed by every table in
    // tablesInvolved would incorrectly also apply this join/filter when generating queries for
    // "customers" itself (e.g. row-count reconciliation), which is wrong -- the filter
    // (orders.order_date >= ...) has nothing to do with counting customers.
    const joinRows = [
      makeJoinRow({
        id: 'join-orders',
        tableName: 'orders',
        joinType: 'INNER',
        joinCondition: 'orders.customer_id = customers.customer_id',
        tablesInvolved: ['orders', 'customers'],
        filterCondition: "orders.order_date >= '2020-01-01'",
      }),
      makeJoinRow({
        id: 'join-customers',
        tableName: 'customers',
        filterCondition: "customers.status <> 'DELETED'",
      }),
    ];

    const index = buildJoinIndex(joinRows);

    // primaryJoinsForTable: only joins/filters explicitly documented against that exact table.
    expect(primaryJoinsForTable(index, 'orders').map((r) => r.id)).toEqual(['join-orders']);
    expect(primaryJoinsForTable(index, 'customers').map((r) => r.id)).toEqual(['join-customers']);

    // joinsForTable (the broader "participant" index used for referential-integrity lookups)
    // legitimately includes both, since customers does participate in the orders join.
    expect(joinsForTable(index, 'customers').map((r) => r.id).sort()).toEqual(['join-customers', 'join-orders']);
  });

  it('normalizes table names (case, quoting, schema prefix) when matching', () => {
    const joinRows = [
      makeJoinRow({ id: 'j1', tableName: '`Orders`', tablesInvolved: ['raw.Orders', 'Customers'] }),
    ];
    const index = buildJoinIndex(joinRows);
    expect(primaryJoinsForTable(index, 'orders').map((r) => r.id)).toEqual(['j1']);
    expect(joinsForTable(index, 'CUSTOMERS').map((r) => r.id)).toEqual(['j1']);
  });

  it('returns an empty array for a table with no associated joins (no joins sheet / unrelated table)', () => {
    const index = buildJoinIndex([]);
    expect(primaryJoinsForTable(index, 'anything')).toEqual([]);
    expect(joinsForTable(index, 'anything')).toEqual([]);
  });
});

describe('filterMappingRowsBySelection', () => {
  const rows = [
    makeMappingRow({ id: 'row-1' }),
    makeMappingRow({ id: 'row-2' }),
    makeMappingRow({ id: 'row-3' }),
  ];

  it('null means "no explicit selection" -- returns every row unchanged', () => {
    expect(filterMappingRowsBySelection(rows, null)).toBe(rows);
  });

  it('an empty array means explicit Select None -- returns no rows', () => {
    expect(filterMappingRowsBySelection(rows, [])).toEqual([]);
  });

  it('returns only the selected rows, in original order', () => {
    const filtered = filterMappingRowsBySelection(rows, ['row-3', 'row-1']);
    expect(filtered.map((r) => r.id)).toEqual(['row-1', 'row-3']);
  });

  it('silently ignores a selected id that no longer matches any row', () => {
    const filtered = filterMappingRowsBySelection(rows, ['row-1', 'row-does-not-exist']);
    expect(filtered.map((r) => r.id)).toEqual(['row-1']);
  });
});
