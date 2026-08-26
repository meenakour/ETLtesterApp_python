import { describe, expect, it } from 'vitest';
import {
  buildJoinClauseLines,
  buildWhereClauseLines,
  computeJoinScope,
  filterConditionsInScope,
  filterJoinsRelevantTo,
  stripRedundantLeadingKeyword,
} from '@/lib/sql/sqlSnippets';
import type { JoinFilterRow } from '@/types/mapping';

function makeJoin(overrides: Partial<JoinFilterRow>): JoinFilterRow {
  return {
    id: `join-${Math.random()}`,
    tableName: '',
    tablesInvolved: [],
    rawRow: {},
    sheetRowNumber: 1,
    ...overrides,
  };
}

describe('stripRedundantLeadingKeyword', () => {
  it('strips a redundant leading "on"/"where" keyword (case-insensitive)', () => {
    expect(stripRedundantLeadingKeyword('on srctb1.id = srctb2.id', 'on')).toBe('srctb1.id = srctb2.id');
    expect(stripRedundantLeadingKeyword('ON srctb1.id = srctb2.id', 'on')).toBe('srctb1.id = srctb2.id');
    expect(stripRedundantLeadingKeyword('where amount > 0', 'where')).toBe('amount > 0');
  });

  it('regression: leaves a condition with no redundant keyword completely unchanged -- most mapping docs do not have one', () => {
    expect(stripRedundantLeadingKeyword('srctb1.id = srctb2.id', 'on')).toBe('srctb1.id = srctb2.id');
    expect(stripRedundantLeadingKeyword('amount > 0', 'where')).toBe('amount > 0');
  });

  it('does not false-positive on a condition that merely starts with the keyword as a substring of an identifier', () => {
    // "on_hold_flag" starts with "on" but is not followed by whitespace -- must not be stripped.
    expect(stripRedundantLeadingKeyword("on_hold_flag = 'N'", 'on')).toBe("on_hold_flag = 'N'");
  });
});

describe('buildJoinClauseLines', () => {
  it('regression: only attaches a join when the current table is actually one of the two tables involved', () => {
    const joins = [
      makeJoin({ tableName: 'orders', joinCondition: 'orders.id = customers.id', tablesInvolved: ['orders', 'customers'] }),
      makeJoin({ tableName: 'invoices', joinCondition: 'invoices.id = lines.invoice_id', tablesInvolved: ['invoices', 'lines'] }),
    ];
    const lines = buildJoinClauseLines('orders', joins);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('JOIN `customers` ON orders.id = customers.id');
    expect(lines.join('\n')).not.toContain('invoices');
  });

  it('strips a redundant leading "on" from the joins sheet before appending it after its own ON keyword', () => {
    // Regression: some mapping docs write the condition cell as if "on" were already part of the
    // text (e.g. "on srctb1.id = srctb2.id"); blindly appending after our own "ON " previously
    // produced invalid doubled SQL ("ON on srctb1.id = ...").
    const joins = [makeJoin({ tableName: 'orders', joinCondition: 'on orders.id = customers.id', tablesInvolved: ['orders', 'customers'] })];
    const lines = buildJoinClauseLines('orders', joins);
    expect(lines[0]).toBe('INNER JOIN `customers` ON orders.id = customers.id');
  });
});

describe('buildWhereClauseLines', () => {
  it('strips a redundant leading "where" the same way', () => {
    const joins = [makeJoin({ tableName: 'orders', filterCondition: 'where orders.status = \'ACTIVE\'' })];
    expect(buildWhereClauseLines(joins)).toEqual(["(orders.status = 'ACTIVE')"]);
  });

  it('leaves a normal filter condition unchanged', () => {
    const joins = [makeJoin({ tableName: 'orders', filterCondition: "orders.status = 'ACTIVE'" })];
    expect(buildWhereClauseLines(joins)).toEqual(["(orders.status = 'ACTIVE')"]);
  });
});

describe('filterJoinsRelevantTo', () => {
  it('only returns joins whose tablesInvolved includes the given table', () => {
    const relevant = makeJoin({ tableName: 'orders', tablesInvolved: ['orders', 'customers'] });
    const irrelevant = makeJoin({ tableName: 'invoices', tablesInvolved: ['invoices', 'lines'] });
    expect(filterJoinsRelevantTo('orders', [relevant, irrelevant])).toEqual([relevant]);
  });
});

describe('computeJoinScope', () => {
  it('regression: attaches a join reached transitively through another join, not just tables directly joined to the anchor', () => {
    // A joined to B, B joined to C: querying FROM A should still pick up the B-C join once B is
    // brought into scope, not just the direct A-B one -- both are genuinely part of the same query.
    const joins = [
      makeJoin({ tableName: 'srctb1', joinCondition: 'srctb1.id = srctb2.id', tablesInvolved: ['srctb1', 'srctb2'] }),
      makeJoin({ tableName: 'srctb2', joinCondition: 'srctb2.cd = srctb3.cd', tablesInvolved: ['srctb2', 'srctb3'] }),
      makeJoin({ tableName: 'invoices', joinCondition: 'invoices.id = lines.invoice_id', tablesInvolved: ['invoices', 'lines'] }),
    ];
    const { lines, tables } = computeJoinScope('srctb1', joins);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes('`srctb2`'))).toBe(true);
    expect(lines.some((l) => l.includes('`srctb3`'))).toBe(true);
    expect(lines.join('\n')).not.toContain('invoices');
    expect([...tables].sort()).toEqual(['srctb1', 'srctb2', 'srctb3']);
  });

  it('does not attach a join whose tables are already both in scope (no redundant self-referencing join)', () => {
    const joins = [
      makeJoin({ tableName: 'a', joinCondition: 'a.id = b.id', tablesInvolved: ['a', 'b'] }),
      makeJoin({ tableName: 'b', joinCondition: 'b.id = a.id', tablesInvolved: ['b', 'a'] }), // same pair, documented from the other side
    ];
    const { lines } = computeJoinScope('a', joins);
    expect(lines).toHaveLength(1);
  });

  it('regression: handles "schema.table alias" compound cells -- quotes schema and table separately and preserves the alias, instead of quoting the whole raw cell as one broken identifier', () => {
    const joins = [
      makeJoin({
        tableName: 'analytics_customer_ddz.t_indv_cust indv_cust',
        joinCondition: 'indv_cust.id = indv_cust_mbr.id',
        tablesInvolved: ['analytics_customer_ddz.t_indv_cust indv_cust', 'analytics_customer_ddz.t_indv_cust_mbr indv_cust_mbr'],
      }),
    ];
    const { lines, tables, anchorAlias } = computeJoinScope('t_indv_cust', joins);
    expect(lines[0]).toBe(
      'INNER JOIN `analytics_customer_ddz`.`t_indv_cust_mbr` indv_cust_mbr ON indv_cust.id = indv_cust_mbr.id'
    );
    expect([...tables].sort()).toEqual(['t_indv_cust', 't_indv_cust_mbr']);
    expect(anchorAlias).toBe('indv_cust');
  });

  it('leaves anchorAlias undefined when the joins sheet never documents an alias for the anchor table', () => {
    const joins = [makeJoin({ tableName: 'orders', joinCondition: 'orders.id = customers.id', tablesInvolved: ['orders', 'customers'] })];
    const { anchorAlias } = computeJoinScope('orders', joins);
    expect(anchorAlias).toBeUndefined();
  });
});

describe('filterConditionsInScope', () => {
  it('regression: includes a filter documented against a table only reachable transitively, not just the anchor table itself', () => {
    const joins = [
      makeJoin({ tableName: 'srctb1', joinCondition: 'srctb1.id = srctb2.id', tablesInvolved: ['srctb1', 'srctb2'] }),
      makeJoin({ tableName: 'srctb1', tablesInvolved: ['srctb1'], filterCondition: 'srctb1.bgn_dt < CURRENT_DATE' }),
      makeJoin({ tableName: 'srctb2', tablesInvolved: ['srctb2'], filterCondition: 'srctb2.end_dt > CURRENT_DATE' }),
      makeJoin({ tableName: 'unrelated', tablesInvolved: ['unrelated'], filterCondition: 'unrelated.flag = 1' }),
    ];
    const { tables } = computeJoinScope('srctb1', joins);
    const scoped = filterConditionsInScope(joins, tables);
    const conditions = scoped.map((r) => r.filterCondition);
    expect(conditions).toContain('srctb1.bgn_dt < CURRENT_DATE');
    expect(conditions).toContain('srctb2.end_dt > CURRENT_DATE');
    expect(conditions).not.toContain('unrelated.flag = 1');
  });
});
