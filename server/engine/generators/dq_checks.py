"""Direct port of src/lib/generators/dqChecksGenerator.ts, including the referential-integrity
direction/dedup fix from the TypeScript version's regression history.
"""

from __future__ import annotations

import re
from itertools import count

from engine.associate_joins import all_join_rows
from engine.cde import is_cde_identifier
from engine.datatype import classify_datatype
from engine.etl_system_fields import is_etl_system_field
from engine.identifier_quoting import qualified_table, quote_column
from engine.models import GeneratorContext, MappingRow, TestCase
from engine.normalize_table_name import normalize_table_name
from engine.source_reference import resolve_target_reference
from engine.sql_snippets import strip_redundant_leading_keyword
from engine.table_type_config import get_table_type_config

_EMAIL_PATTERN = re.compile(r"email", re.IGNORECASE)
_PHONE_PATTERN = re.compile(r"phone|mobile|contact_no|tel", re.IGNORECASE)
_DATE_NAME_PATTERN = re.compile(r"date|_dt$|dob", re.IGNORECASE)
# Note: deliberately excludes "_code" -- in practice a "_code" suffix is just as often a
# classification/status code as it is a genuinely unique identifier. Only "_id"/"_key" are
# reliable enough to assume uniqueness from the name alone.
_ID_SUFFIX_PATTERN = re.compile(r"_id$|_key$", re.IGNORECASE)
_MEASURE_NAME_EXCLUDE = re.compile(r"count$|_pct$|percent|_num(ber)?$|_amount$|_total$|_qty$|quantity$|_rate$|ratio$", re.IGNORECASE)

_draft_id = count(1)


def _next_draft_id() -> str:
    return f"draft-{next(_draft_id)}"


def _is_text_format_candidate(row: MappingRow, pattern: re.Pattern) -> bool:
    if not pattern.search(row.target_field):
        return False
    if _MEASURE_NAME_EXCLUDE.search(row.target_field):
        return False
    datatype = row.target_datatype or row.source_datatype
    if datatype and classify_datatype(datatype) == "numeric":
        return False
    return True


def _substitute_table_aliases(condition: str, child_table: str, other_table: str) -> str:
    escaped_child = re.escape(child_table)
    escaped_other = re.escape(other_table)
    condition = re.sub(rf"\b{escaped_child}\.", "c.", condition, flags=re.IGNORECASE)
    condition = re.sub(rf"\b{escaped_other}\.", "p.", condition, flags=re.IGNORECASE)
    return condition


def generate_dq_checks(ctx: GeneratorContext) -> list[TestCase]:
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
            col = quote_column(row.target_field)
            is_date_type = bool(row.target_datatype and re.search(r"date|timestamp", row.target_datatype, re.IGNORECASE))

            if _is_text_format_candidate(row, _EMAIL_PATTERN):
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"DQ Check (email format): {target_table}.{row.target_field}",
                        category="DQ_CHECKS",
                        priority="P2",
                        description=f"Confirms values in {row.target_field} conform to a valid email address format.",
                        steps=["Run the format-validation query.", "Confirm invalid_email_count is 0."],
                        expected_result="invalid_email_count is 0 for all non-null values.",
                        sql=(
                            f"SELECT COUNT(*) AS invalid_email_count\nFROM {qualified}\nWHERE {col} IS NOT NULL\n"
                            f"  AND NOT {col} RLIKE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{{2,}}$';"
                        ),
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

            if _is_text_format_candidate(row, _PHONE_PATTERN):
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"DQ Check (phone format): {target_table}.{row.target_field}",
                        category="DQ_CHECKS",
                        priority="P2",
                        description=f"Confirms values in {row.target_field} conform to a plausible phone number format.",
                        steps=["Run the format-validation query.", "Confirm invalid_phone_count is 0 (adjust the pattern to your expected format)."],
                        expected_result="invalid_phone_count is 0 for all non-null values.",
                        sql=(
                            f"SELECT COUNT(*) AS invalid_phone_count\nFROM {qualified}\nWHERE {col} IS NOT NULL\n"
                            f"  AND NOT {col} RLIKE '^[+]?[0-9()\\\\-\\\\s]{{7,15}}$';"
                        ),
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

            if _DATE_NAME_PATTERN.search(row.target_field) and not is_date_type:
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"DQ Check (date format): {target_table}.{row.target_field}",
                        category="DQ_CHECKS",
                        priority="P2",
                        description=f"{row.target_field} looks like a date field but is stored as {row.target_datatype or 'a non-date type'}; confirms values still parse as valid dates.",
                        steps=["Run the parse-validation query.", "Confirm unparseable_date_count is 0 (adjust the format mask to the actual source format)."],
                        expected_result="unparseable_date_count is 0 for all non-null values.",
                        sql=(
                            f"SELECT COUNT(*) AS unparseable_date_count\nFROM {qualified}\nWHERE {col} IS NOT NULL\n"
                            f"  AND TO_DATE({col}, 'yyyy-MM-dd') IS NULL;"
                        ),
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

            if _ID_SUFFIX_PATTERN.search(row.target_field) and not row.is_primary_key:
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"DQ Check (duplicate values): {target_table}.{row.target_field}",
                        category="DQ_CHECKS",
                        priority="P2",
                        description=f"{row.target_field} looks like an identifier/code/key field; confirms it has no unexpected duplicates in {target_table}.",
                        steps=["Run the duplicate-detection query.", "Review any returned values."],
                        expected_result="Zero rows returned, unless duplicates are expected for this field (e.g. a non-unique foreign key).",
                        sql=f"SELECT {col}, COUNT(*) AS dup_count\nFROM {qualified}\nGROUP BY {col}\nHAVING COUNT(*) > 1;",
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

        any_pk = any(r.is_primary_key for r in rows)
        if not any_pk:
            all_fields = [r.target_field for r in rows if r.target_field]
            if all_fields:
                column_list = ", ".join(quote_column(f) for f in all_fields)
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"DQ Check (whole-row duplicates): {target_table}",
                        category="DQ_CHECKS",
                        priority="P1",
                        description=f"No primary key is flagged for {target_table} in the mapping document; confirms there are no fully duplicated rows.",
                        steps=["Run the GROUP BY across all mapped columns.", "Confirm no group has a count greater than 1."],
                        expected_result="Zero rows returned.",
                        sql=f"SELECT {column_list}, COUNT(*) AS dup_count\nFROM {qualified}\nGROUP BY {column_list}\nHAVING COUNT(*) > 1;",
                        target_table=target_table,
                        source_mapping_row_ids=[r.id for r in rows],
                    )
                )

            for row in rows:
                if not row.target_field or _ID_SUFFIX_PATTERN.search(row.target_field) or not is_cde_identifier(row.target_field):
                    continue
                col = quote_column(row.target_field)
                test_cases.append(
                    TestCase(
                        id=_next_draft_id(),
                        name=f"CDE Uniqueness Check: {target_table}.{row.target_field}",
                        category="DQ_CHECKS",
                        priority="P1",
                        is_cde=True,
                        description=f"No primary key is flagged for {target_table}; {row.target_field} is a Critical Data Element expected to be unique — confirms no unexpected duplicates.",
                        steps=["Run the duplicate-detection query.", "Review any returned values."],
                        expected_result="Zero rows returned, unless duplicates are an approved exception for this field.",
                        sql=f"SELECT {col}, COUNT(*) AS dup_count\nFROM {qualified}\nGROUP BY {col}\nHAVING COUNT(*) > 1;",
                        target_table=target_table,
                        source_mapping_row_ids=[row.id],
                    )
                )

    test_cases.extend(_build_referential_integrity_checks(ctx))

    return test_cases


def _build_referential_integrity_checks(ctx: GeneratorContext) -> list[TestCase]:
    test_cases: list[TestCase] = []
    all_joins = all_join_rows(ctx.join_index)

    target_by_normalized_name: dict[str, tuple[str, list[MappingRow]]] = {}
    for target_table, rows in ctx.mapping_rows_by_target_table.items():
        target_by_normalized_name[normalize_table_name(target_table)] = (target_table, rows)

    for join in all_joins:
        if not join.join_condition:
            continue

        # The joins sheet's own "Table" column names the table THIS join was documented for -- i.e.
        # the table doing the joining out to a lookup/parent table. Treat that as the child
        # (FK-holding) side and the other table in the pair as the referenced parent.
        entry = target_by_normalized_name.get(normalize_table_name(join.table_name))
        if not entry:
            continue
        child_table, child_rows = entry

        if get_table_type_config(ctx.table_type_configs, child_table).target_kind != "table":
            continue

        normalized_child = normalize_table_name(child_table)
        other_table = next((t for t in join.tables_involved if normalize_table_name(t) != normalized_child), None)
        if not other_table:
            continue

        child_schema = next((r.target_schema for r in child_rows if r.target_schema), None)
        qualified_child = qualified_table(child_schema, child_table)

        aliased_condition = _substitute_table_aliases(
            strip_redundant_leading_keyword(join.join_condition, "on"), child_table, other_table
        )
        parent_col_match = re.search(r"p\.(\w+)", aliased_condition)
        if not parent_col_match:
            continue
        parent_col = parent_col_match.group(1)
        child_col_match = re.search(r"c\.(\w+)", aliased_condition)
        child_col = child_col_match.group(1) if child_col_match else None

        sql = "\n".join(
            [
                "SELECT COUNT(*) AS orphan_count",
                f"FROM {qualified_child} c",
                f"LEFT JOIN {quote_column(other_table)} p ON {aliased_condition}",
                f"WHERE p.{parent_col} IS NULL{f' AND c.{child_col} IS NOT NULL' if child_col else ''};",
            ]
        )

        test_cases.append(
            TestCase(
                id=_next_draft_id(),
                name=f"DQ Check (referential integrity): {child_table} -> {other_table}",
                category="DQ_CHECKS",
                priority="P1",
                description=f"Confirms every {child_table} row referencing {other_table} (per the documented join condition) has a matching parent record — no orphaned foreign keys.",
                steps=[
                    f"Run the LEFT JOIN orphan-check query ({child_table} is the referencing/child side per the joins sheet; {other_table} is the referenced parent).",
                    "Confirm orphan_count is 0.",
                ],
                expected_result="orphan_count is 0 — every referenced parent row exists.",
                sql=sql,
                target_table=child_table,
                source_mapping_row_ids=[r.id for r in child_rows],
            )
        )

    return test_cases
