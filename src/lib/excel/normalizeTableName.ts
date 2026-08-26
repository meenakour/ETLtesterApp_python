import { parseTableRef } from '@/lib/excel/parseTableRef';

// A cell can combine schema, table, and alias in one string (e.g. "schema.t_indv_cust indv_cust"
// -- see parseTableRef) -- only the bare table name is a stable matching key across the joins
// sheet and the mapping sheet's own (alias-less) Source/Target Table columns.
export function normalizeTableName(raw: string | undefined | null): string {
  if (!raw) return '';
  return parseTableRef(raw).table.trim().toLowerCase();
}
