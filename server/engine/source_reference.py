"""Direct port of src/lib/sql/sourceReference.ts."""

from __future__ import annotations

from engine.file_format import build_file_path, infer_file_format
from engine.identifier_quoting import qualified_table
from engine.models import MappingRow, TableTypeConfig


def resolve_reference(kind: str, schema: str | None, table: str, file_format: str | None, file_path: str | None) -> str:
    if kind == "file" and file_path:
        return f"{file_format or 'csv'}.`{file_path}`"
    return qualified_table(schema, table)


def resolve_source_reference(
    config: TableTypeConfig, rows: list[MappingRow], source_schema: str | None, source_table: str
) -> str:
    if config.source_kind != "file":
        return qualified_table(source_schema, source_table)

    row_with_file = next((r for r in rows if r.source_file_location or r.source_file_name), None)
    detected_path = (
        build_file_path(row_with_file.source_file_location, row_with_file.source_file_name) if row_with_file else ""
    )
    file_path = detected_path or config.source_file_path_override or ""

    detected_format = infer_file_format(row_with_file.source_file_name) if row_with_file and row_with_file.source_file_name else None
    file_format = detected_format or config.source_file_format_override or "csv"

    return resolve_reference("file", source_schema, source_table, file_format, file_path)


def resolve_target_reference(config: TableTypeConfig, target_schema: str | None, target_table: str) -> str:
    if config.target_kind != "file":
        return qualified_table(target_schema, target_table)
    file_format = config.target_file_format_override or "csv"
    return resolve_reference("file", target_schema, target_table, file_format, config.target_file_path_override or "")
