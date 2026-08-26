import { describe, expect, it } from 'vitest';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';

describe('normalizeTableName', () => {
  it('lowercases a bare table name', () => {
    expect(normalizeTableName('Orders')).toBe('orders');
  });

  it('strips a schema prefix', () => {
    expect(normalizeTableName('analytics_customer_ddz.t_indv_cust')).toBe('t_indv_cust');
  });

  it('regression: strips a trailing alias too, so a "schema.table alias" cell normalizes to the same key as the bare table name -- previously the alias was left attached, so this never matched the mapping sheet\'s own (alias-less) Source/Target Table columns and joins silently never attached', () => {
    expect(normalizeTableName('analytics_customer_ddz.t_indv_cust indv_cust')).toBe('t_indv_cust');
    expect(normalizeTableName('t_indv_cust indv_cust')).toBe('t_indv_cust');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeTableName('')).toBe('');
    expect(normalizeTableName(undefined)).toBe('');
    expect(normalizeTableName(null)).toBe('');
  });
});
