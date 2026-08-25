"""Direct port of src/lib/excel/buildMappingRows.ts, including the compound-Source-Table and
multi-line-cell fixes from the TypeScript version's regression history.
"""

from __future__ import annotations

import re

from engine.models import DetectedColumn, MappingRow, SheetData

_TRUTHY = {"y", "yes", "true", "1", "x", "pk"}


def _parse_boolean(value: object) -> bool:
    text = str(value if value is not None else "").strip().lower()
    return text in _TRUTHY


def _get_value(record: dict, header: str | None) -> str:
    if not header:
        return ""
    raw = str(record.get(header, "") or "")
    return re.sub(r"\s+", " ", raw.strip())


def _get_raw_value(record: dict, header: str | None) -> str:
    if not header:
        return ""
    return str(record.get(header, "") or "").strip()


def _split_multiline_value(raw: str) -> list[str]:
    return [s.strip() for s in re.split(r"\r\n|\r|\n", raw) if s.strip()]


def _first_table_name(value: str) -> str:
    parts = re.split(r"[,;]|\band\b|&", value, flags=re.IGNORECASE)
    return parts[0].strip() if parts else ""


def build_mapping_rows(sheet: SheetData, columns: list[DetectedColumn]) -> list[MappingRow]:
    by_field = {c.field: c for c in columns}

    def get(field: str) -> DetectedColumn | None:
        return by_field.get(field)

    pk_column = get("primaryKeyFlag")
    nullable_column = get("nullableFlag")

    result: list[MappingRow] = []
    for index, row in enumerate(sheet.rows):
        source_field_raw = _get_raw_value(row, get("sourceField").matched_header if get("sourceField") else None)
        target_field_raw = _get_raw_value(row, get("targetField").matched_header if get("targetField") else None)

        source_lines = _split_multiline_value(source_field_raw)
        target_lines = _split_multiline_value(target_field_raw)
        line_count = max(len(source_lines), len(target_lines), 1)

        nullable_raw = (
            _parse_boolean(row.get(nullable_column.matched_header, "")) if nullable_column and nullable_column.matched_header else True
        )
        is_nullable = (not nullable_raw if nullable_column.inverted else nullable_raw) if nullable_column else True

        shared = {
            "source_table": _first_table_name(_get_value(row, get("sourceTable").matched_header if get("sourceTable") else None)),
            "source_schema": _get_value(row, get("sourceSchema").matched_header if get("sourceSchema") else None),
            "transformation": _get_value(row, get("transformation").matched_header if get("transformation") else None),
            "target_table": _get_value(row, get("targetTable").matched_header if get("targetTable") else None),
            "target_schema": _get_value(row, get("targetSchema").matched_header if get("targetSchema") else None),
            "source_datatype": _get_value(row, get("sourceDatatype").matched_header if get("sourceDatatype") else None),
            "target_datatype": _get_value(row, get("targetDatatype").matched_header if get("targetDatatype") else None),
            "is_primary_key": _parse_boolean(row.get(pk_column.matched_header, "")) if pk_column and pk_column.matched_header else False,
            "is_nullable": is_nullable,
            "source_file_location": _get_value(row, get("sourceFileLocation").matched_header if get("sourceFileLocation") else None) or None,
            "source_file_name": _get_value(row, get("sourceFileName").matched_header if get("sourceFileName") else None) or None,
            "raw_row": row,
            "sheet_row_number": sheet.header_row_index + index + 2,
        }

        for line_index in range(line_count):
            source_field = source_lines[line_index] if line_index < len(source_lines) else (source_lines[0] if source_lines else "")
            target_field = target_lines[line_index] if line_index < len(target_lines) else (target_lines[0] if target_lines else "")
            row_id = f"map-{index}-{line_index}" if line_count > 1 else f"map-{index}"
            mapping_row = MappingRow(id=row_id, source_field=source_field, target_field=target_field, **shared)
            if mapping_row.source_field or mapping_row.target_field:
                result.append(mapping_row)

    return result
