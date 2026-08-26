"""Direct port of src/lib/generators/rowCountGenerator.ts, including the primary-source-table
picking, transitive join-scope, and redundant-keyword fixes from the TypeScript version's
regression history.
"""

from __future__ import annotations

from itertools import count

from engine.associate_joins import all_join_rows
from engine.models import GeneratorContext, MappingRow, TestCase
from engine.normalize_table_name import normalize_table_name
from engine.source_reference import resolve_source_reference, resolve_target_reference
from engine.sql_snippets import build_where_clause_lines, combine_where, compute_join_scope, filter_conditions_in_scope
from engine.table_type_config import get_table_type_config

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def _pick_primary_source_table(rows: list[MappingRow], target_table: str) -> tuple[str, list[MappingRow]] | None:
    groups: dict[str, list[MappingRow]] = {}
    for row in rows:
        if not row.source_table:
            continue
        groups.setdefault(row.source_table, []).append(row)
    if not groups:
        return None

    normalized_target = normalize_table_name(target_table)
    best: tuple[str, list[MappingRow]] | None = None
    for source_table, src_rows in groups.items():
        if best is None:
            best = (source_table, src_rows)
            continue
        if len(src_rows) > len(best[1]):
            best = (source_table, src_rows)
        elif len(src_rows) == len(best[1]) and normalize_table_name(source_table) == normalized_target:
            best = (source_table, src_rows)
    return best


def generate_row_count_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        type_config = get_table_type_config(ctx.table_type_configs, target_table)
        if type_config.target_kind == "dashboard":
            continue

        target_schema = next((r.target_schema for r in rows if r.target_schema), None)

        primary = _pick_primary_source_table(rows, target_table)
        if not primary:
            continue
        source_table, src_rows = primary

        source_schema = next((r.source_schema for r in src_rows if r.source_schema), None)
        is_file_source = type_config.source_kind == "file"
        relevant_joins = [] if is_file_source else all_join_rows(ctx.join_index)

        source_qualified = resolve_source_reference(type_config, src_rows, source_schema, source_table)
        target_qualified = resolve_target_reference(type_config, target_schema, target_table)

        scope = compute_join_scope(source_table, relevant_joins)
        from_line = f"FROM {source_qualified} {scope.anchor_alias}" if scope.anchor_alias else f"FROM {source_qualified}"
        from_clause = "\n".join([from_line, *scope.lines])
        scoped_filters = filter_conditions_in_scope(relevant_joins, scope.tables)
        where_clause = combine_where(build_where_clause_lines(scoped_filters))
        has_joins_or_filters = len(scope.lines) > 0 or len(scoped_filters) > 0

        source_sql = "\n".join(p for p in [f"SELECT COUNT(*) AS source_row_count", from_clause, where_clause] if p)
        target_sql = f"SELECT COUNT(*) AS target_row_count\nFROM {target_qualified};"

        sql = f"-- Source row count\n{source_sql};\n\n-- Target row count\n{target_sql}"

        source_label = f"{source_table} (file)" if is_file_source else source_table
        joins_note = ", honoring any documented join/filter conditions" if has_joins_or_filters else ""
        joins_step_note = " with the associated joins/filters applied" if has_joins_or_filters else ""

        test_cases.append(
            TestCase(
                id=_next_draft_id(),
                name=f"Row Count Reconciliation: {source_label} -> {target_table}",
                category="ROW_COUNT_RECONCILIATION",
                priority="P1",
                description=(
                    f"Confirms the number of rows loaded into {target_table} matches the number of "
                    f"eligible rows in {source_label}{joins_note}."
                ),
                steps=[
                    f"Run the source count query against {'the source file' if is_file_source else f'`{source_table}`'}{joins_step_note}.",
                    f"Run the target count query against `{target_table}`.",
                    "Compare source_row_count to target_row_count.",
                ],
                expected_result=(
                    "source_row_count equals target_row_count (or matches a documented, intentional "
                    "delta if filters are expected to exclude rows)."
                ),
                sql=sql,
                target_table=target_table,
                source_mapping_row_ids=[r.id for r in src_rows],
            )
        )

    return test_cases
