"""Direct port of src/lib/sql/sqlSnippets.ts, including the transitive-join-scope and
redundant-leading-keyword fixes from the TypeScript version's regression history.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from engine.identifier_quoting import qualified_table
from engine.models import JoinFilterRow
from engine.normalize_table_name import normalize_table_name
from engine.parse_table_ref import parse_table_ref


def filter_joins_relevant_to(current_table: str, join_rows: list[JoinFilterRow]) -> list[JoinFilterRow]:
    normalized_current = normalize_table_name(current_table)
    return [row for row in join_rows if any(normalize_table_name(t) == normalized_current for t in row.tables_involved)]


def strip_redundant_leading_keyword(condition: str, keyword: str) -> str:
    return re.sub(rf"^\s*{keyword}\s+", "", condition, flags=re.IGNORECASE)


def _format_join_target(raw: str) -> str:
    """Formats a joins-sheet table cell as the target of a JOIN clause -- e.g.
    "analytics_customer_ddz.t_indv_cust_mbr indv_cust_mbr" becomes
    "`analytics_customer_ddz`.`t_indv_cust_mbr` indv_cust_mbr". Quoting the whole raw cell as one
    identifier (the previous behavior) produced an identifier containing a literal dot and space --
    syntactically invalid, and it silently dropped the alias the join's own ON condition expects to
    resolve against.
    """
    ref = parse_table_ref(raw)
    qualified = qualified_table(ref.schema, ref.table)
    return f"{qualified} {ref.alias}" if ref.alias else qualified


def _find_documented_alias(normalized_table: str, join_rows: list[JoinFilterRow]) -> str | None:
    """Finds the alias (if any) the joins sheet documents for a table, by scanning every join
    row's own table cell and its "tables involved" list for one that normalizes to the same table.
    """
    for row in join_rows:
        candidates = [row.table_name, *row.tables_involved]
        for candidate in candidates:
            if normalize_table_name(candidate) == normalized_table:
                alias = parse_table_ref(candidate).alias
                if alias:
                    return alias
    return None


@dataclass
class JoinScope:
    lines: list[str] = field(default_factory=list)
    tables: set[str] = field(default_factory=set)
    # The alias the joins sheet documents for `current_table` itself, if any -- e.g. `current_table`
    # is "t_indv_cust" but a "Table 1"/"Table 2" cell writes it as "schema.t_indv_cust indv_cust".
    # Callers need this to declare the same alias on the FROM clause, since the join lines' ON
    # conditions (as documented) reference that alias, not the bare table name.
    anchor_alias: str | None = None


def compute_join_scope(current_table: str, join_rows: list[JoinFilterRow]) -> JoinScope:
    normalized_current = normalize_table_name(current_table)
    tables: set[str] = {normalized_current}
    remaining = [r for r in join_rows if r.join_condition]
    lines: list[str] = []

    progressed = True
    while progressed:
        progressed = False
        still_remaining: list[JoinFilterRow] = []
        for row in remaining:
            normalized_tables = [normalize_table_name(t) for t in row.tables_involved]
            reachable = any(t in tables for t in normalized_tables)
            other_table = next((t for t in row.tables_involved if normalize_table_name(t) not in tables), None)
            if reachable and other_table:
                join_type = (row.join_type or "INNER").upper()
                join_type_normalized = join_type if "JOIN" in join_type else f"{join_type} JOIN"
                condition = strip_redundant_leading_keyword(row.join_condition or "", "on")
                lines.append(f"{join_type_normalized} {_format_join_target(other_table)} ON {condition}")
                tables.add(normalize_table_name(other_table))
                progressed = True
            else:
                still_remaining.append(row)
        remaining = still_remaining

    return JoinScope(lines=lines, tables=tables, anchor_alias=_find_documented_alias(normalized_current, join_rows))


def build_join_clause_lines(current_table: str, join_rows: list[JoinFilterRow]) -> list[str]:
    return compute_join_scope(current_table, join_rows).lines


def build_where_clause_lines(join_rows: list[JoinFilterRow]) -> list[str]:
    return [
        f"({strip_redundant_leading_keyword(row.filter_condition, 'where')})"
        for row in join_rows
        if row.filter_condition
    ]


def filter_conditions_in_scope(join_rows: list[JoinFilterRow], scope: set[str]) -> list[JoinFilterRow]:
    return [
        row
        for row in join_rows
        if row.filter_condition and any(normalize_table_name(t) in scope for t in row.tables_involved)
    ]


def build_from_clause(qualified_table: str, join_rows: list[JoinFilterRow]) -> str:
    scope = compute_join_scope(qualified_table, join_rows)
    from_line = f"FROM {qualified_table} {scope.anchor_alias}" if scope.anchor_alias else f"FROM {qualified_table}"
    return "\n".join([from_line, *scope.lines])


def combine_where(where_parts: list[str]) -> str:
    if not where_parts:
        return ""
    return "WHERE " + "\n  AND ".join(where_parts)
