"""Direct port of src/lib/generators/index.ts."""

from __future__ import annotations

from typing import Callable

from engine.generators.business_rule import generate_business_rule_tests
from engine.generators.dashboard_kpi import generate_dashboard_kpi_tests
from engine.generators.dq_checks import generate_dq_checks
from engine.generators.edge_case import generate_edge_case_tests
from engine.generators.negative_calculation import generate_negative_calculation_tests
from engine.generators.pk_null_uniqueness import generate_pk_null_uniqueness_tests
from engine.generators.row_count import generate_row_count_tests
from engine.generators.schema_validation import generate_schema_validation_tests
from engine.generators.transformation_validation import generate_transformation_validation_tests
from engine.models import GeneratorContext, TestCase
from engine.test_case_id import assign_sequential_ids

GeneratorFn = Callable[[GeneratorContext], list[TestCase]]

GENERATORS: dict[str, GeneratorFn] = {
    "ROW_COUNT_RECONCILIATION": generate_row_count_tests,
    "SCHEMA_DATATYPE_VALIDATION": generate_schema_validation_tests,
    "PK_NULL_UNIQUENESS": generate_pk_null_uniqueness_tests,
    "TRANSFORMATION_VALIDATION": generate_transformation_validation_tests,
    "EDGE_CASE_DATATYPE": generate_edge_case_tests,
    "DQ_CHECKS": generate_dq_checks,
    "BUSINESS_RULE": generate_business_rule_tests,
    "NEGATIVE_CALCULATION": generate_negative_calculation_tests,
    "DASHBOARD_KPI_VALIDATION": generate_dashboard_kpi_tests,
}


def run_generators(selected: list[str], ctx: GeneratorContext) -> list[TestCase]:
    generated: list[TestCase] = []
    for category in selected:
        generated.extend(GENERATORS[category](ctx))
    return assign_sequential_ids(generated)
