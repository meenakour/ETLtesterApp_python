"""Direct port of src/lib/generators/transformationValidationGenerator.ts."""

from __future__ import annotations

from itertools import count

from engine.etl_system_fields import is_etl_system_field
from engine.models import GeneratorContext, TestCase
from engine.table_type_config import get_table_type_config
from engine.transformation_sql import build_field_validation_sql

_VALUE_TRANSFORM_STRATEGIES = {"CONCAT_EXPRESSION", "DIRECT_SQL_FUNCTION", "ARITHMETIC_EXPRESSION", "DEFAULT_OR_LOOKUP"}

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def generate_transformation_validation_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        type_config = get_table_type_config(ctx.table_type_configs, target_table)
        if type_config.target_kind == "dashboard":
            continue

        for row in rows:
            if not row.transformation.strip() or not row.target_field or not row.source_field:
                continue
            if is_etl_system_field(row.target_field):
                continue

            result = build_field_validation_sql(row, rows, type_config, ctx.all_mapping_rows)
            if result.classification.strategy == "DIRECT_COPY":
                continue
            if result.classification.strategy not in _VALUE_TRANSFORM_STRATEGIES:
                continue

            if result.is_manual_review:
                steps = [
                    f"Run the source query against `{row.source_table}` to see the raw values feeding this field.",
                    f"Run the target query against `{target_table}` to see the actual loaded values.",
                ]
            else:
                steps = [
                    f"Run the source query against `{row.source_table}` — derived_target_value is what the transformation should produce.",
                    f"Run the target query against `{target_table}` — actual_target_value is what was actually loaded.",
                    "Match rows by key across both result sets and compare derived_target_value to actual_target_value.",
                ]

            test_cases.append(
                TestCase(
                    id=_next_draft_id(),
                    name=f"Transformation Validation: {target_table}.{row.target_field}",
                    category="TRANSFORMATION_VALIDATION",
                    priority="P2",
                    description=f'Confirms the transformation rule for {row.target_field} ("{row.transformation}") produces the expected value in {target_table}.',
                    steps=steps,
                    expected_result="For every row, actual_target_value (target query) equals derived_target_value (source query).",
                    sql=result.sql,
                    target_table=target_table,
                    source_mapping_row_ids=[row.id],
                    is_manual_review=result.is_manual_review,
                )
            )

    return test_cases
