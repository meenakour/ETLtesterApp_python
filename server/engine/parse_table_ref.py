"""Direct port of src/lib/excel/parseTableRef.ts."""

from __future__ import annotations

import re
from dataclasses import dataclass

_QUOTE_CHARS = re.compile(r"[`\"\[\]]")


@dataclass
class TableRef:
    table: str
    schema: str | None = None
    alias: str | None = None


def parse_table_ref(raw: str | None) -> TableRef:
    """Parses a Joins & Filters "Table" cell that may combine schema, table, and alias in one
    string -- e.g. "analytics_customer_ddz.t_indv_cust indv_cust" -- which is how real mapping
    docs commonly write join participants so the join condition text can reference the alias
    directly (the ON clause says "indv_cust.col = ...", not "t_indv_cust.col = ..."). Also handles
    schema-less ("t_cvr_sbscr cvr_sbscr"), alias-less ("analytics_policy_ddz.t_grp_cust_pln_struct"),
    and bare ("orders") forms.
    """
    cleaned = _QUOTE_CHARS.sub("", str(raw or "").strip())
    if not cleaned:
        return TableRef(table="")

    tokens = cleaned.split()
    qualified_part = tokens[0] if tokens else ""
    alias = tokens[1] if len(tokens) > 1 else None

    dot_parts = [p.strip() for p in qualified_part.split(".") if p.strip()]
    table = dot_parts[-1] if dot_parts else qualified_part
    schema = ".".join(dot_parts[:-1]) if len(dot_parts) > 1 else None

    return TableRef(schema=schema, table=table, alias=alias)
