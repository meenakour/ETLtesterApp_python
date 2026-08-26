from engine.parse_table_ref import parse_table_ref


# A cell can combine schema, table, and alias in one string (e.g. "schema.t_indv_cust indv_cust"
# -- see parse_table_ref) -- only the bare table name is a stable matching key across the joins
# sheet and the mapping sheet's own (alias-less) Source/Target Table columns.
def normalize_table_name(raw: str | None) -> str:
    if not raw:
        return ""
    return parse_table_ref(raw).table.strip().lower()
