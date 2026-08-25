"""Direct port of src/lib/excel/associateJoins.ts."""

from __future__ import annotations

from engine.models import JoinAssociation, JoinFilterRow, MappingRow
from engine.normalize_table_name import normalize_table_name


def build_join_index(join_rows: list[JoinFilterRow]) -> JoinAssociation:
    joins_by_table: dict[str, list[JoinFilterRow]] = {}
    primary_joins_by_table: dict[str, list[JoinFilterRow]] = {}
    source_counts: dict[str, set[str]] = {}

    def add_entry(table_map: dict[str, list[JoinFilterRow]], table_key: str, row: JoinFilterRow) -> None:
        if not table_key:
            return
        existing = table_map.setdefault(table_key, [])
        if row not in existing:
            existing.append(row)

    for row in join_rows:
        primary_key = normalize_table_name(row.table_name)
        if primary_key:
            add_entry(joins_by_table, primary_key, row)
            add_entry(primary_joins_by_table, primary_key, row)
            origins = source_counts.setdefault(primary_key, set())
            origins.add(row.schema_name or "default")

        for involved in row.tables_involved:
            key = normalize_table_name(involved)
            if key:
                add_entry(joins_by_table, key, row)

    ambiguous_tables = [table for table, origins in source_counts.items() if len(origins) > 1]

    return JoinAssociation(
        joins_by_table=joins_by_table, primary_joins_by_table=primary_joins_by_table, ambiguous_tables=ambiguous_tables
    )


def joins_for_table(index: JoinAssociation, table_name: str) -> list[JoinFilterRow]:
    return index.joins_by_table.get(normalize_table_name(table_name), [])


def primary_joins_for_table(index: JoinAssociation, table_name: str) -> list[JoinFilterRow]:
    return index.primary_joins_by_table.get(normalize_table_name(table_name), [])


def all_join_rows(index: JoinAssociation) -> list[JoinFilterRow]:
    # A plain `set` would dedupe but, unlike a JS Set, does not preserve insertion order -- which
    # made downstream WHERE-clause ordering nondeterministic across runs. Dedupe by identity while
    # keeping first-seen order instead.
    seen_ids: set[int] = set()
    result: list[JoinFilterRow] = []
    for rows in index.joins_by_table.values():
        for row in rows:
            if id(row) not in seen_ids:
                seen_ids.add(id(row))
                result.append(row)
    return result


def group_mapping_rows_by_target_table(rows: list[MappingRow]) -> dict[str, list[MappingRow]]:
    grouped: dict[str, list[MappingRow]] = {}
    for row in rows:
        key = row.target_table or "(unspecified table)"
        grouped.setdefault(key, []).append(row)
    return grouped
