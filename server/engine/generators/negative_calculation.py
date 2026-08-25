"""Direct port of src/lib/generators/negativeCalculationGenerator.ts."""

from __future__ import annotations

import re
from itertools import count

from engine.associate_joins import primary_joins_for_table
from engine.identifier_quoting import quote_column
from engine.models import GeneratorContext, MappingRow, TestCase
from engine.source_reference import resolve_source_reference, resolve_target_reference
from engine.sql_snippets import build_from_clause
from engine.table_type_config import get_table_type_config

_AGGREGATION_PATTERN = re.compile(r"\b(sum|avg|average|count|min|max)\s*\(", re.IGNORECASE)
_GROUP_BY_PATTERN = re.compile(r"\bgroup\s+by\b", re.IGNORECASE)
# Note: "ratio" has no leading \b -- an underscore (as in "discount_ratio") is a word character, so
# a boundary wouldn't exist there and the match would silently fail. "_rate" keeps a literal leading
# underscore instead of \b so it doesn't false-positive on words like "corporate".
_PERCENT_NAME_PATTERN = re.compile(r"percent|pct|_rate\b|ratio", re.IGNORECASE)
_PERCENT_EXPR_PATTERN = re.compile(r"%|/\s*100\b|\*\s*100\b")
_DIVISION_PATTERN = re.compile(r"([A-Za-z_][\w.]*)\s*/\s*([A-Za-z_][\w.]*)")

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def _find_source_field_case_insensitive(rows: list[MappingRow], name: str) -> MappingRow | None:
    lower = name.lower()
    return next((r for r in rows if r.source_field.lower() == lower), None)


def _is_aggregation_transform(text: str) -> bool:
    return bool(_AGGREGATION_PATTERN.search(text) or _GROUP_BY_PATTERN.search(text))


def generate_negative_calculation_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        type_config = get_table_type_config(ctx.table_type_configs, target_table)
        if type_config.target_kind == "dashboard":
            continue

        target_schema = next((r.target_schema for r in rows if r.target_schema), None)
        source_schema = next((r.source_schema for r in rows if r.source_schema), None)
        source_table = next((r.source_table for r in rows if r.source_table), None)
        qualified_tgt = resolve_target_reference(type_config, target_schema, target_table)
        qualified_src = resolve_source_reference(type_config, rows, source_schema, source_table) if source_table else None

        for row in rows:
            text = row.transformation.strip()
            if not text or not row.target_field:
                continue

            division_match = _DIVISION_PATTERN.search(text)
            if division_match and qualified_src:
                numerator_token = division_match.group(1).split(".")[-1]
                denominator_token = division_match.group(2).split(".")[-1]
                numerator_row = _find_source_field_case_insensitive(rows, numerator_token)
                denominator_row = _find_source_field_case_insensitive(rows, denominator_token)

                # Only trust this as a real division formula when BOTH sides resolve to known
                # source fields -- otherwise it's likely incidental text that happens to contain a
                # slash, not an actual division.
                if numerator_row and denominator_row:
                    denominator_field = denominator_row.source_field
                    denominator_col = quote_column(denominator_field)
                    test_cases.append(
                        TestCase(
                            id=_next_draft_id(),
                            name=f"Negative Test (division by zero): {target_table}.{row.target_field}",
                            category="NEGATIVE_CALCULATION",
                            priority="P1",
                            description=f'The transformation for {row.target_field} ("{text}") divides by {denominator_field}; confirms the ETL doesn\'t error or silently misbehave when the denominator is zero.',
                            steps=[
                                f"Run the query to find source rows where {denominator_field} = 0.",
                                f"If any exist, inspect the corresponding {target_table}.{row.target_field} value.",
                                "Confirm it is NULL/0 (or another documented sentinel) rather than a job failure or an infinite/garbage value.",
                            ],
                            expected_result=f"Rows with {denominator_field} = 0 produce a defined, documented result in {row.target_field} — not a job failure or garbage value.",
                            sql=f"SELECT COUNT(*) AS zero_denominator_count\nFROM {qualified_src}\nWHERE {denominator_col} = 0;",
                            target_table=target_table,
                            source_mapping_row_ids=[row.id],
                        )
                    )

            looks_like_percent_or_ratio = bool(_PERCENT_NAME_PATTERN.search(row.target_field) or _PERCENT_EXPR_PATTERN.search(text))
            if looks_like_percent_or_ratio:
                is_ratio = bool(re.search(r"ratio", row.target_field, re.IGNORECASE)) and not bool(
                    re.search(r"percent|pct", row.target_field, re.IGNORECASE)
                )
                upper_bound = 1 if is_ratio else 100
                kind = "ratio" if is_ratio else "percentage"

                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"Negative Test (out-of-range {kind}): {target_table}.{row.target_field}",
                        category="NEGATIVE_CALCULATION",
                        priority="P2",
                        description=f'{row.target_field} is a {kind}-style field derived from "{text}"; confirms values fall within the expected 0-{upper_bound} range.',
                        steps=[
                            "Run the range-check query.",
                            f"Confirm out_of_range_count is 0 (adjust the bounds if this field legitimately allows values outside 0-{upper_bound}).",
                        ],
                        expected_result=f"out_of_range_count is 0 — all values fall within 0-{upper_bound}.",
                        sql=f"SELECT COUNT(*) AS out_of_range_count\nFROM {qualified_tgt}\nWHERE {quote_column(row.target_field)} < 0 OR {quote_column(row.target_field)} > {upper_bound};",
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

            if _is_aggregation_transform(text) and qualified_src and row.source_field:
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"Negative Test (NULL handling in aggregation): {target_table}.{row.target_field}",
                        category="NEGATIVE_CALCULATION",
                        priority="P2",
                        description=f'The transformation for {row.target_field} ("{text}") aggregates values; confirms NULLs in the source field are handled per business-rule expectations (Spark SQL aggregate functions ignore NULLs by default).',
                        steps=[
                            "Run the query to count NULLs in the source field feeding this aggregation.",
                            f"If any exist, confirm {row.target_field} reflects the intended NULL-handling (excluded vs. treated as zero).",
                        ],
                        expected_result="The aggregated value in the target matches the documented NULL-handling behavior for this transformation.",
                        sql=f"SELECT COUNT(*) AS null_input_count\nFROM {qualified_src}\nWHERE {quote_column(row.source_field)} IS NULL;",
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

        has_aggregation = any(_is_aggregation_transform(r.transformation) for r in rows)
        if has_aggregation and qualified_src and source_table:
            relevant_joins = primary_joins_for_table(ctx.join_index, source_table)
            if relevant_joins:
                from_clause = build_from_clause(qualified_src, relevant_joins)
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"Negative Test (join fan-out risk): {target_table}",
                        category="NEGATIVE_CALCULATION",
                        priority="P1",
                        description=f"{target_table} has an aggregation-based transformation fed by a joined source; confirms the join doesn't multiply rows (fan-out) and inflate the aggregate.",
                        steps=[
                            f"Compare base_row_count (unjoined {source_table}) against joined_row_count below.",
                            "A joined count that is a large multiple of the base count indicates fan-out — investigate before trusting the aggregation.",
                        ],
                        expected_result="joined_row_count is not an unexpected multiple of base_row_count (no fan-out inflating the aggregation).",
                        sql=(
                            f"-- Unjoined row count\nSELECT COUNT(*) AS base_row_count FROM {qualified_src};\n\n"
                            f"-- Joined row count (as used by the aggregation)\nSELECT COUNT(*) AS joined_row_count\n{from_clause};"
                        ),
                        target_table=target_table,
                        source_mapping_row_ids=[r.id for r in rows],
                    )
                )

    return test_cases
