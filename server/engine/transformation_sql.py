"""Direct port of src/lib/generators/transformationSql.ts."""

from __future__ import annotations

import re
from dataclasses import dataclass

from engine.business_rule_heuristics import (
    TransformationClassification,
    classify_transformation,
    qualify_field_references,
)
from engine.identifier_quoting import qualified_column, quote_column
from engine.models import MappingRow, TableTypeConfig
from engine.source_reference import resolve_source_reference, resolve_target_reference


@dataclass
class FieldValidationSql:
    sql: str
    is_manual_review: bool
    classification: TransformationClassification


def _split_comma_tokens(value: str) -> list[str]:
    return [t.strip() for t in re.split(r"[,;]", value) if t.strip()]


def _is_single_column_name(value: str) -> bool:
    return len(value.strip()) > 0 and not re.search(r"[,;]", value)


@dataclass
class _KeyColumns:
    source_cols: list[str]
    target_cols: list[str]
    used_fallback_key: bool


def _pick_key_columns(table_rows: list[MappingRow]) -> _KeyColumns:
    clean_rows = [r for r in table_rows if _is_single_column_name(r.source_field) and _is_single_column_name(r.target_field)]
    key_rows = [r for r in clean_rows if r.is_primary_key]
    effective_key_rows = key_rows if key_rows else clean_rows
    return _KeyColumns(
        source_cols=[r.source_field for r in effective_key_rows],
        target_cols=[r.target_field for r in effective_key_rows],
        used_fallback_key=len(key_rows) == 0,
    )


def build_known_fields(table_rows: list[MappingRow], all_mapping_rows: list[MappingRow]) -> list[str]:
    raw = (
        [r.source_field for r in table_rows]
        + [r.target_field for r in table_rows]
        + [r.source_field for r in all_mapping_rows]
    )
    result: list[str] = []
    for value in raw:
        if value:
            result.extend(_split_comma_tokens(value))
    return result


def build_source_target_queries(
    row: MappingRow, table_rows: list[MappingRow], type_config: TableTypeConfig, qualified_expr: str
) -> str:
    source_qualified = resolve_source_reference(type_config, table_rows, row.source_schema, row.source_table)
    target_qualified = resolve_target_reference(type_config, row.target_schema, row.target_table)
    keys = _pick_key_columns(table_rows)
    key_comment = (
        "-- NOTE: no primary key flagged for this table; every mapped field is listed so rows can still be correlated by eye.\n"
        if keys.used_fallback_key
        else ""
    )

    source_key_select = [qualified_column("s", f) for f in keys.source_cols]
    target_key_select = [qualified_column("t", f) for f in keys.target_cols]
    source_order_by = ", ".join(source_key_select) if keys.source_cols else qualified_column("s", row.source_field)
    target_order_by = ", ".join(target_key_select) if keys.target_cols else qualified_column("t", row.target_field)

    source_sql = "\n".join(
        [
            f"{key_comment}-- SOURCE query: derived_target_value is what the transformation should produce.",
            f"SELECT {', '.join([*source_key_select, f'{qualified_expr} AS derived_target_value'])}",
            f"FROM {source_qualified} s",
            f"ORDER BY {source_order_by};",
        ]
    )

    target_value_col = qualified_column("t", row.target_field)
    target_select = ", ".join([*target_key_select, f"{target_value_col} AS actual_target_value"])
    target_sql = "\n".join(
        [
            "-- TARGET query: actual_target_value is what was actually loaded -- compare rows by key against the source query above.",
            f"SELECT {target_select}",
            f"FROM {target_qualified} t",
            f"ORDER BY {target_order_by};",
        ]
    )

    return f"{source_sql}\n\n{target_sql}"


def build_field_validation_sql(
    row: MappingRow,
    table_rows: list[MappingRow],
    type_config: TableTypeConfig,
    all_mapping_rows: list[MappingRow] | None = None,
) -> FieldValidationSql:
    if all_mapping_rows is None:
        all_mapping_rows = table_rows
    known_fields = build_known_fields(table_rows, all_mapping_rows)
    classification = classify_transformation(row.transformation, known_fields)

    if classification.expression:
        qualified_expr = qualify_field_references(classification.expression, known_fields, "s")
        sql = build_source_target_queries(row, table_rows, type_config, qualified_expr)
        return FieldValidationSql(sql=sql, is_manual_review=False, classification=classification)

    source_qualified = resolve_source_reference(type_config, table_rows, row.source_schema, row.source_table)
    target_qualified = resolve_target_reference(type_config, row.target_schema, row.target_table)

    source_sql = "\n".join(
        [
            "-- SOURCE query (reference only -- the transformation below could not be auto-translated)",
            f'-- Raw transformation rule for {row.target_field}: "{row.transformation}"',
            f"SELECT * FROM {source_qualified} s LIMIT 10;",
        ]
    )
    target_sql = "\n".join(
        [
            "-- TARGET query",
            f"-- MANUAL REVIEW REQUIRED: translate the rule above into a comparison against {quote_column(row.target_field)} below.",
            f"SELECT * FROM {target_qualified} t LIMIT 10;",
        ]
    )

    sql = f"{source_sql}\n\n{target_sql}"
    return FieldValidationSql(sql=sql, is_manual_review=True, classification=classification)
