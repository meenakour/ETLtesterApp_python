"""Direct port of src/lib/generators/pkNullUniquenessGenerator.ts."""

from __future__ import annotations

import re
from itertools import count

from engine.cde import is_critical_data_element
from engine.identifier_quoting import qualified_table, quote_column
from engine.models import GeneratorContext, TestCase
from engine.table_type_config import get_table_type_config

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def generate_pk_null_uniqueness_tests(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []

    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        if get_table_type_config(ctx.table_type_configs, target_table).target_kind != "table":
            continue

        target_schema = next((r.target_schema for r in rows if r.target_schema), None)
        qualified = qualified_table(target_schema, target_table)

        pk_fields = [r for r in rows if r.is_primary_key and r.target_field]
        if pk_fields:
            pk_columns = ", ".join(quote_column(r.target_field) for r in pk_fields)
            sql = "\n".join(
                [
                    f"-- Primary key uniqueness check for {target_table}",
                    f"SELECT {pk_columns}, COUNT(*) AS dup_count",
                    f"FROM {qualified}",
                    f"GROUP BY {pk_columns}",
                    "HAVING COUNT(*) > 1;",
                ]
            )
            test_cases.append(
                TestCase(
                    id=_next_draft_id(),
                    name=f"Primary Key Uniqueness: {target_table}",
                    category="PK_NULL_UNIQUENESS",
                    priority="P1",
                    description=(
                        f"Confirms the primary key ({', '.join(r.target_field for r in pk_fields)}) is "
                        f"unique in {target_table} with no duplicate records."
                    ),
                    steps=[
                        f"Run the GROUP BY / HAVING query above against `{target_table}`.",
                        "Confirm the result set is empty.",
                    ],
                    expected_result="Zero rows returned — no duplicate primary key values exist.",
                    sql=sql,
                    target_table=target_table,
                    source_mapping_row_ids=[r.id for r in pk_fields],
                )
            )

        not_null_fields = [r for r in rows if r.target_field and not r.is_nullable]
        if not_null_fields:
            null_checks = "\n\n".join(
                f"-- {r.target_field} must not contain NULLs\n"
                f"SELECT COUNT(*) AS null_violation_count_{re.sub(r'\\W+', '_', r.target_field)}\n"
                f"FROM {qualified}\nWHERE {quote_column(r.target_field)} IS NULL;"
                for r in not_null_fields
            )
            test_cases.append(
                TestCase(
                    id=_next_draft_id(),
                    name=f"NOT NULL Validation: {target_table}",
                    category="PK_NULL_UNIQUENESS",
                    priority="P1",
                    description=(
                        f"Confirms fields flagged as non-nullable in the mapping document "
                        f"({', '.join(r.target_field for r in not_null_fields)}) contain no NULLs in {target_table}."
                    ),
                    steps=[
                        f"Run the null-check query for `{r.target_field}` and confirm the count is 0."
                        for r in not_null_fields
                    ],
                    expected_result="null_violation_count is 0 for every checked field.",
                    sql=null_checks,
                    target_table=target_table,
                    source_mapping_row_ids=[r.id for r in not_null_fields],
                )
            )

        cde_nullable_fields = [r for r in rows if r.target_field and r.is_nullable and is_critical_data_element(r.target_field)]
        if cde_nullable_fields:
            cde_checks = "\n\n".join(
                f"-- CDE {r.target_field} is flagged nullable in the mapping doc — verify NULLs are genuinely acceptable\n"
                f"SELECT COUNT(*) AS cde_null_count_{re.sub(r'\\W+', '_', r.target_field)}\n"
                f"FROM {qualified}\nWHERE {quote_column(r.target_field)} IS NULL;"
                for r in cde_nullable_fields
            )
            field_list = ", ".join(r.target_field for r in cde_nullable_fields)
            are_or_is = "are" if len(cde_nullable_fields) > 1 else "is"
            test_cases.append(
                TestCase(
                    id=_next_draft_id(),
                    name=f"CDE Not-Null Enforcement: {target_table}",
                    category="PK_NULL_UNIQUENESS",
                    priority="P1",
                    is_cde=True,
                    description=(
                        f"{field_list} {are_or_is} Critical Data Element(s) flagged nullable in the mapping "
                        "document; confirms NULLs are a genuine business exception rather than a mapping oversight."
                    ),
                    steps=[
                        f"Run the null-check query for CDE field `{r.target_field}` and confirm the count is 0, "
                        "or is an explicitly approved exception."
                        for r in cde_nullable_fields
                    ],
                    expected_result="cde_null_count is 0 for every checked CDE field, unless a documented business exception applies.",
                    sql=cde_checks,
                    target_table=target_table,
                    source_mapping_row_ids=[r.id for r in cde_nullable_fields],
                )
            )

    return test_cases
