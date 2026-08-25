"""Direct port of src/lib/generators/schemaValidationGenerator.ts."""

from __future__ import annotations

from itertools import count

from engine.identifier_quoting import qualified_table
from engine.models import GeneratorContext, TestCase
from engine.table_type_config import get_table_type_config

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def generate_schema_validation_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        if get_table_type_config(ctx.table_type_configs, target_table).target_kind != "table":
            continue

        target_schema = next((r.target_schema for r in rows if r.target_schema), None)
        fields_with_datatype = [r for r in rows if r.target_field and r.target_datatype]
        if not fields_with_datatype:
            continue

        expected_table = "\n".join(
            f"  {r.target_field.ljust(30)} expected: {r.target_datatype}, nullable: {'Y' if r.is_nullable else 'N'}"
            for r in fields_with_datatype
        )

        sql = "\n".join(
            [
                f"-- Verify column datatypes and nullability for {target_table} (Unity Catalog information_schema)",
                "SELECT column_name, data_type, is_nullable",
                "FROM information_schema.columns",
                f"WHERE table_schema = '{target_schema or ''}' AND table_name = '{target_table}'",
                "ORDER BY ordinal_position;",
                "",
                "-- Fallback if information_schema is unavailable:",
                f"-- DESCRIBE TABLE {qualified_table(target_schema, target_table)};",
            ]
        )

        test_cases.append(
            TestCase(
                id=_next_draft_id(),
                name=f"Schema & Datatype Validation: {target_table}",
                category="SCHEMA_DATATYPE_VALIDATION",
                priority="P1",
                description=f"Confirms every mapped column in {target_table} has the datatype and nullability declared in the mapping document.",
                steps=[
                    f"Run the schema query against `{target_table}`.",
                    "Compare each returned column against the expected values below.",
                    f"Expected columns:\n{expected_table}",
                ],
                expected_result="Every column's data_type and is_nullable matches the mapping document; no unmapped/missing columns.",
                sql=sql,
                target_table=target_table,
                source_mapping_row_ids=[r.id for r in fields_with_datatype],
            )
        )

    return test_cases
