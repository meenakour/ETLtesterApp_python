"""Direct port of src/lib/generators/businessRuleGenerator.ts."""

from __future__ import annotations

from itertools import count

from engine.etl_system_fields import is_etl_system_field
from engine.models import GeneratorContext, TestCase
from engine.table_type_config import get_table_type_config
from engine.transformation_sql import build_field_validation_sql

_BUSINESS_RULE_STRATEGIES = {"CASE_EXPRESSION", "MANUAL_REVIEW"}

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def generate_business_rule_tests(ctx: GeneratorContext) -> list[TestCase]:
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
            if result.classification.strategy not in _BUSINESS_RULE_STRATEGIES:
                continue

            is_manual_review = result.is_manual_review
            name = (
                f"Business Rule Review: {target_table}.{row.target_field}"
                if is_manual_review
                else f"Business Rule Validation: {target_table}.{row.target_field}"
            )
            description = (
                f'The mapping document defines a business rule for {row.target_field} that could not be '
                f'automatically translated into SQL: "{row.transformation}". Requires manual translation/review '
                "by a tester familiar with the source system."
                if is_manual_review
                else f'Confirms the conditional business rule for {row.target_field} ("{row.transformation}") is correctly applied when loading {target_table}.'
            )
            expected_result = (
                "Not automatically verifiable — a tester must translate the rule above into SQL and confirm target "
                "values match, then update this test case."
                if is_manual_review
                else "For every row, actual_target_value (target query) equals derived_target_value (source query)."
            )
            steps = (
                [
                    f'Review the raw transformation text: "{row.transformation}".',
                    "Consult the source system / business stakeholders to clarify the intended logic.",
                    f"Run the source and target queries below as a starting point, then write the real validation query comparing derived vs. actual values in `{target_table}`.",
                ]
                if is_manual_review
                else [
                    f"Run the source query against `{row.source_table}` — derived_target_value is what the business rule should produce.",
                    f"Run the target query against `{target_table}` — actual_target_value is what was actually loaded.",
                    "Match rows by key across both result sets and compare derived_target_value to actual_target_value.",
                ]
            )

            test_cases.append(
                TestCase(
                    id=_next_draft_id(),
                    name=name,
                    category="BUSINESS_RULE",
                    priority="P1" if is_manual_review else "P2",
                    description=description,
                    steps=steps,
                    expected_result=expected_result,
                    sql=result.sql,
                    target_table=target_table,
                    source_mapping_row_ids=[row.id],
                    is_manual_review=is_manual_review,
                )
            )

    return test_cases
