"""Direct port of src/lib/sql/sqlSnippets.ts, including the transitive-join-scope and
redundant-leading-keyword fixes from the TypeScript version's regression history.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from engine.identifier_quoting import quote_column
from engine.models import JoinFilterRow
from engine.normalize_table_name import normalize_table_name


def filter_joins_relevant_to(current_table: str, join_rows: list[JoinFilterRow]) -> list[JoinFilterRow]:
    normalized_current = normalize_table_name(current_table)
    return [row for row in join_rows if any(normalize_table_name(t) == normalized_current for t in row.tables_involved)]


def strip_redundant_leading_keyword(condition: str, keyword: str) -> str:
    return re.sub(rf"^\s*{keyword}\s+", "", condition, flags=re.IGNORECASE)


@dataclass
class JoinScope:
    lines: list[str] = field(default_factory=list)
    tables: set[str] = field(default_factory=set)


def compute_join_scope(current_table: str, join_rows: list[JoinFilterRow]) -> JoinScope:
    tables: set[str] = {normalize_table_name(current_table)}
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
                lines.append(f"{join_type_normalized} {quote_column(other_table)} ON {condition}")
                tables.add(normalize_table_name(other_table))
                progressed = True
            else:
                still_remaining.append(row)
        remaining = still_remaining

    return JoinScope(lines=lines, tables=tables)


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
    parts = [f"FROM {qualified_table}", *build_join_clause_lines(qualified_table, join_rows)]
    return "\n".join(parts)


def combine_where(where_parts: list[str]) -> str:
    if not where_parts:
        return ""
    return "WHERE " + "\n  AND ".join(where_parts)
