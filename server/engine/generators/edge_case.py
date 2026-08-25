"""Direct port of src/lib/generators/edgeCaseGenerator.ts."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import count

from engine.datatype import classify_datatype, parse_decimal_scale, parse_length
from engine.etl_system_fields import is_etl_system_field
from engine.identifier_quoting import quote_column
from engine.models import GeneratorContext, MappingRow, TestCase
from engine.source_reference import resolve_target_reference
from engine.table_type_config import get_table_type_config

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


@dataclass
class _Check:
    label: str
    sql: str
    expectation: str


def _string_checks(row: MappingRow, col: str, table: str) -> list[_Check]:
    checks = [
        _Check(
            label="whitespace-only values",
            sql=f"SELECT COUNT(*) AS whitespace_only_count FROM {table} WHERE TRIM({col}) = '' AND {col} IS NOT NULL;",
            expectation="whitespace_only_count is 0 (no values that are only spaces).",
        ),
        _Check(
            label="empty string vs. NULL",
            sql=f"SELECT COUNT(*) AS empty_string_count FROM {table} WHERE {col} = '';",
            expectation="empty_string_count is 0, or a documented/expected value if empty strings are valid for this field.",
        ),
    ]
    length = parse_length(row.target_datatype or row.source_datatype)
    if length:
        checks.append(
            _Check(
                label="length overflow",
                sql=f"SELECT COUNT(*) AS length_overflow_count FROM {table} WHERE LENGTH({col}) > {length};",
                expectation=f"length_overflow_count is 0 (no values exceeding the declared length of {length}).",
            )
        )
    return checks


def _numeric_checks(row: MappingRow, col: str, table: str) -> list[_Check]:
    checks = [
        _Check(
            label="negative values",
            sql=f"SELECT COUNT(*) AS negative_value_count FROM {table} WHERE {col} < 0;",
            expectation="negative_value_count is 0, unless negative values are expected for this field.",
        ),
        _Check(
            label="zero values",
            sql=f"SELECT COUNT(*) AS zero_value_count FROM {table} WHERE {col} = 0;",
            expectation="Review zero_value_count for plausibility given the business context of this field.",
        ),
    ]
    scale = parse_decimal_scale(row.target_datatype or row.source_datatype)
    if scale is not None:
        checks.append(
            _Check(
                label="precision overflow",
                sql=f"SELECT COUNT(*) AS precision_overflow_count FROM {table} WHERE {col} != ROUND({col}, {scale});",
                expectation=f"precision_overflow_count is 0 (no values with more than {scale} decimal place(s)).",
            )
        )
    return checks


def _date_checks(col: str, table: str) -> list[_Check]:
    return [
        _Check(
            label="null dates",
            sql=f"SELECT COUNT(*) AS null_date_count FROM {table} WHERE {col} IS NULL;",
            expectation="null_date_count is 0, unless this field is expected to allow NULL dates.",
        ),
        _Check(
            label="future dates (adjust if legitimately allowed)",
            sql=f"SELECT COUNT(*) AS future_date_count FROM {table} WHERE {col} > CURRENT_DATE();",
            expectation="future_date_count is 0, unless future-dated records are valid for this field.",
        ),
        _Check(
            label="sentinel/default dates",
            sql=f"SELECT COUNT(*) AS sentinel_date_count FROM {table} WHERE {col} < DATE('1900-01-01');",
            expectation="sentinel_date_count is 0 (no placeholder/default dates leaking through).",
        ),
    ]


def _boolean_checks(col: str, table: str) -> list[_Check]:
    return [
        _Check(
            label="value domain",
            sql=f"SELECT DISTINCT {col} FROM {table};",
            expectation="Only the expected domain values appear (e.g. true/false, 0/1, Y/N — adjust to the actual domain).",
        ),
        _Check(
            label="values outside expected domain",
            sql=f"SELECT COUNT(*) AS invalid_flag_count FROM {table} WHERE {col} NOT IN (0, 1, '0', '1', 'true', 'false', 'Y', 'N');",
            expectation="invalid_flag_count is 0 — adjust the literal list to match this field's actual domain.",
        ),
    ]


def generate_edge_case_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        type_config = get_table_type_config(ctx.table_type_configs, target_table)
        if type_config.target_kind == "dashboard":
            continue

        target_schema = next((r.target_schema for r in rows if r.target_schema), None)
        qualified = resolve_target_reference(type_config, target_schema, target_table)

        for row in rows:
            if not row.target_field:
                continue
            if is_etl_system_field(row.target_field):
                continue
            datatype = row.target_datatype or row.source_datatype
            cls = classify_datatype(datatype)
            if cls == "unknown":
                continue

            col = quote_column(row.target_field)
            checks: list[_Check] = []
            if cls == "string":
                checks = _string_checks(row, col, qualified)
            elif cls == "numeric":
                checks = _numeric_checks(row, col, qualified)
            elif cls == "date":
                checks = _date_checks(col, qualified)
            elif cls == "boolean":
                checks = _boolean_checks(col, qualified)
            if not checks:
                continue

            sql = "\n\n".join(f"-- {c.label}\n{c.sql}" for c in checks)

            test_cases.append(
                TestCase(
                    id=_next_draft_id(),
                    name=f"Datatype Boundary Validation ({cls}): {target_table}.{row.target_field}",
                    category="EDGE_CASE_DATATYPE",
                    priority="P3",
                    description=f"Datatype-driven boundary checks for {row.target_field} (declared as {datatype or 'unknown type'}) in {target_table}.",
                    steps=[f"Check for {c.label}: run the query and confirm — {c.expectation}" for c in checks],
                    expected_result=" ".join(c.expectation for c in checks),
                    sql=sql,
                    target_table=target_table,
                    source_mapping_row_ids=[row.id],
                )
            )

    return test_cases
