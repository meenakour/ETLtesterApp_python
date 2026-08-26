export interface TableRef {
  schema?: string;
  table: string;
  alias?: string;
}

/**
 * Parses a Joins & Filters "Table" cell that may combine schema, table, and alias in one string
 * -- e.g. "analytics_customer_ddz.t_indv_cust indv_cust" -- which is how real mapping docs commonly
 * write join participants so the join condition text can reference the alias directly (the ON
 * clause says "indv_cust.col = ...", not "t_indv_cust.col = ..."). Also handles schema-less
 * ("t_cvr_sbscr cvr_sbscr"), alias-less ("analytics_policy_ddz.t_grp_cust_pln_struct"), and bare
 * ("orders") forms.
 */
export function parseTableRef(raw: string | undefined | null): TableRef {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[`"[\]]/g, '');
  if (!cleaned) return { table: '' };

  const [qualifiedPart, alias] = cleaned.split(/\s+/).filter(Boolean);
  const dotParts = (qualifiedPart ?? '')
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
  const table = dotParts[dotParts.length - 1] ?? qualifiedPart ?? '';
  const schema = dotParts.length > 1 ? dotParts.slice(0, -1).join('.') : undefined;

  return { schema, table, alias };
}
