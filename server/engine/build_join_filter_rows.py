"""Direct port of src/lib/excel/buildJoinFilterRows.ts, including the tablesInvolved-union fix and
standalone "filter" section support from the TypeScript version's regression history.
"""

from __future__ import annotations

import re

from engine.models import DetectedColumn, JoinFilterRow, SheetData
from engine.parse_table_ref import parse_table_ref

_FILTER_SECTION_MARKER = re.compile(r"^filters?$", re.IGNORECASE)
_LEADING_TABLE_REF = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\.")


def _get_value(record: dict, header: str | None) -> str:
    if not header:
        return ""
    return str(record.get(header, "") or "").strip()


def _split_table_list(text: str) -> list[str]:
    if not text:
        return []
    return [t.strip() for t in re.split(r",|;|\band\b|&", text, flags=re.IGNORECASE) if t.strip()]


def build_join_filter_rows(sheet: SheetData, columns: list[DetectedColumn]) -> list[JoinFilterRow]:
    by_field = {c.field: c for c in columns}

    def get(field: str) -> DetectedColumn | None:
        return by_field.get(field)

    table_name_field = get("tableName")
    table_name_header = table_name_field.matched_header if table_name_field else None
    tables_involved_field = get("tablesInvolved")
    tables_involved_header = tables_involved_field.matched_header if tables_involved_field else None

    # A standalone filter condition (see below) names its table by whatever alias the joins
    # section above assigned it -- e.g. "cvr_sbscr.end_dt = ..." where "cvr_sbscr" is the alias a
    # "Table 1"/"Table 2" cell gave to `t_cvr_sbscr` ("schema.t_cvr_sbscr cvr_sbscr"), not the real
    # table name. Build that alias -> table map from the documented joins up front so the filter
    # still attaches to the right table's join scope instead of being treated as its own table.
    alias_to_table: dict[str, str] = {}
    saw_filter_marker = False
    for row in sheet.rows:
        cell = _get_value(row, table_name_header)
        if _FILTER_SECTION_MARKER.match(cell):
            saw_filter_marker = True
            continue
        if saw_filter_marker:
            continue
        for header in (table_name_header, tables_involved_header):
            raw = _get_value(row, header)
            if not raw:
                continue
            for part in _split_table_list(raw):
                ref = parse_table_ref(part)
                if ref.alias and ref.table:
                    alias_to_table[ref.alias.lower()] = ref.table

    rows: list[JoinFilterRow] = []
    in_filter_section = False

    for index, row in enumerate(sheet.rows):
        raw_table_name_cell = _get_value(row, table_name_header)

        if _FILTER_SECTION_MARKER.match(raw_table_name_cell):
            in_filter_section = True
            continue  # the marker row itself isn't a real join/filter row

        if in_filter_section:
            condition_text = raw_table_name_cell
            match = _LEADING_TABLE_REF.match(condition_text)
            if not condition_text or not match:
                continue  # can't tell which table this applies to -- skip rather than guess
            inferred_token = match.group(1)
            inferred_table = alias_to_table.get(inferred_token.lower(), inferred_token)
            rows.append(
                JoinFilterRow(
                    id=f"join-{index}",
                    table_name=inferred_table,
                    tables_involved=[inferred_table],
                    filter_condition=condition_text,
                    raw_row=row,
                    sheet_row_number=sheet.header_row_index + index + 2,
                )
            )
            continue

        table_name = _get_value(row, table_name_header)
        tables_involved_field = get("tablesInvolved")
        tables_involved_raw = _get_value(row, tables_involved_field.matched_header if tables_involved_field else None)

        # A join row's own Table Name is, by definition, always one of the tables involved in it --
        # but some mapping docs split a join's two sides into separate "Table1"/"Table2" columns
        # rather than one combined "Tables Involved" list, so the fuzzy matcher only ever picks up
        # the second column. Union with `table_name` unconditionally so this holds regardless of
        # which column layout the sheet uses.
        normalized_table_name = table_name.strip().lower()
        parsed_tables_involved = _split_table_list(tables_involved_raw)
        if table_name:
            tables_involved = [table_name] + [
                t for t in parsed_tables_involved if t.strip().lower() != normalized_table_name
            ]
        else:
            tables_involved = parsed_tables_involved

        schema_field = get("schemaName")
        join_type_field = get("joinType")
        join_condition_field = get("joinCondition")
        filter_condition_field = get("filterCondition")

        join_filter_row = JoinFilterRow(
            id=f"join-{index}",
            table_name=table_name,
            schema_name=_get_value(row, schema_field.matched_header if schema_field else None) or None,
            join_type=_get_value(row, join_type_field.matched_header if join_type_field else None) or None,
            join_condition=_get_value(row, join_condition_field.matched_header if join_condition_field else None) or None,
            tables_involved=tables_involved,
            filter_condition=_get_value(row, filter_condition_field.matched_header if filter_condition_field else None) or None,
            raw_row=row,
            sheet_row_number=sheet.header_row_index + index + 2,
        )
        if join_filter_row.table_name or join_filter_row.tables_involved or join_filter_row.join_condition or join_filter_row.filter_condition:
            rows.append(join_filter_row)

    return rows
