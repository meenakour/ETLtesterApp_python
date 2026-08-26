import { describe, expect, it } from 'vitest';
import { parseTableRef } from '@/lib/excel/parseTableRef';

describe('parseTableRef', () => {
  it('parses a bare table name with no schema or alias', () => {
    expect(parseTableRef('orders')).toEqual({ schema: undefined, table: 'orders', alias: undefined });
  });

  it('parses "schema.table" with no alias', () => {
    expect(parseTableRef('analytics_policy_ddz.t_grp_cust_pln_struct')).toEqual({
      schema: 'analytics_policy_ddz',
      table: 't_grp_cust_pln_struct',
      alias: undefined,
    });
  });

  it('parses "schema.table alias" -- the compound form real mapping docs use so join conditions can reference the alias', () => {
    expect(parseTableRef('analytics_customer_ddz.t_indv_cust indv_cust')).toEqual({
      schema: 'analytics_customer_ddz',
      table: 't_indv_cust',
      alias: 'indv_cust',
    });
  });

  it('parses "table alias" with no schema', () => {
    expect(parseTableRef('t_cvr_sbscr cvr_sbscr')).toEqual({ schema: undefined, table: 't_cvr_sbscr', alias: 'cvr_sbscr' });
  });

  it('strips surrounding backticks/quotes', () => {
    expect(parseTableRef('`analytics_customer_ddz`.`t_indv_cust`')).toEqual({
      schema: 'analytics_customer_ddz',
      table: 't_indv_cust',
      alias: undefined,
    });
  });

  it('returns an empty table for blank input', () => {
    expect(parseTableRef('')).toEqual({ table: '' });
    expect(parseTableRef(undefined)).toEqual({ table: '' });
    expect(parseTableRef(null)).toEqual({ table: '' });
  });
});
