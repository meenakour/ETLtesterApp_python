"""Direct port of src/lib/generators/dashboardKpiGenerator.ts."""

from __future__ import annotations

from itertools import count

from engine.business_rule_heuristics import classify_transformation, qualify_field_references
from engine.identifier_quoting import quote_column
from engine.models import GeneratorContext, TestCase
from engine.source_reference import resolve_source_reference
from engine.table_type_config import get_table_type_config
from engine.transformation_sql import build_known_fields

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def generate_dashboard_kpi_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        type_config = get_table_type_config(ctx.table_type_configs, target_table)
        if type_config.target_kind != "dashboard":
            continue

        source_table = next((r.source_table for r in rows if r.source_table), "") or ""
        source_schema = next((r.source_schema for r in rows if r.source_schema), None)
        source_qualified = resolve_source_reference(type_config, rows, source_schema, source_table)
        # A KPI formula commonly references a sibling source column mapped elsewhere in the doc,
        # and compound comma-joined Source Column cells get split apart -- see build_known_fields.
        known_fields = build_known_fields(rows, ctx.all_mapping_rows)

        kpi_name = type_config.kpi_name or target_table
        dashboard_name = type_config.dashboard_name or "(dashboard name not set — configure it in Preview)"

        select_columns: list[str] = []
        notes: list[str] = []

        for row in rows:
            if not row.source_field:
                continue
            alias = row.target_field or row.source_field
            classification = classify_transformation(row.transformation, known_fields, allow_aggregates=True)

            if classification.expression:
                qualified_expr = qualify_field_references(classification.expression, known_fields, "s")
                select_columns.append(f"{qualified_expr} AS {quote_column(alias)}")
            else:
                # Not auto-translatable -- still emit a usable (if approximate) query rather than
                # nothing, but flag it clearly so the tester knows this column needs a manual look.
                select_columns.append(f"s.{quote_column(row.source_field)} AS {quote_column(alias)}")
                notes.append(
                    f'-- NOTE: transformation for {alias} ("{row.transformation}") could not be auto-translated; verify this column manually.'
                )

        if not select_columns:
            continue

        sql = "\n".join([*notes, f"SELECT {', '.join(select_columns)}", f"FROM {source_qualified} s;"])

        test_cases.append(
            TestCase(
                id=_next_draft_id(),
                name=f"Dashboard KPI Validation: {kpi_name} ({dashboard_name})",
                category="DASHBOARD_KPI_VALIDATION",
                priority="P1",
                is_dashboard_comparison=True,
                description=f"Computes {kpi_name} from the underlying source data; this is the metric that feeds the '{kpi_name}' tile on the '{dashboard_name}' dashboard.",
                steps=[
                    "Run the query above.",
                    f"Open the '{dashboard_name}' dashboard and locate the '{kpi_name}' tile.",
                    "Compare the query result to the dashboard value, allowing for rounding/currency formatting differences.",
                ],
                expected_result=f"The computed value matches the '{kpi_name}' value shown on the '{dashboard_name}' dashboard (within rounding tolerance).",
                sql=sql,
                target_table=target_table,
                source_mapping_row_ids=[r.id for r in rows],
            )
        )

    return test_cases
