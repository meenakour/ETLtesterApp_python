"""Orchestrates the full ingestion + generation pipeline -- the Python/pandas equivalent of the
frontend's useMappingData()/useAppState() wiring (src/hooks/useMappingData.ts) plus
runGenerators() (src/lib/generators/index.ts), as one callable entry point for the API layer.
"""

from __future__ import annotations

from typing import Any

from engine.aliases import JOIN_FIELD_ALIASES, MAPPING_FIELD_ALIASES
from engine.associate_joins import build_join_index, group_mapping_rows_by_target_table
from engine.build_join_filter_rows import build_join_filter_rows
from engine.build_mapping_rows import build_mapping_rows
from engine.column_detection import detect_columns
from engine.generators import run_generators
from engine.models import GeneratorContext, TableTypeConfig
from engine.rtm import build_rtm
from engine.sheet_detection import classify_sheets, extract_sheet_data, read_all_sheets_raw

_TABLE_TYPE_CONFIG_FIELDS = {
    "sourceKind": "source_kind",
    "targetKind": "target_kind",
    "sourceFileFormatOverride": "source_file_format_override",
    "sourceFilePathOverride": "source_file_path_override",
    "targetFileFormatOverride": "target_file_format_override",
    "targetFilePathOverride": "target_file_path_override",
    "dashboardName": "dashboard_name",
    "kpiName": "kpi_name",
}


def _parse_table_type_configs(raw: dict[str, dict[str, Any]] | None) -> dict[str, TableTypeConfig]:
    result: dict[str, TableTypeConfig] = {}
    for table, cfg in (raw or {}).items():
        kwargs = {_TABLE_TYPE_CONFIG_FIELDS[k]: v for k, v in cfg.items() if k in _TABLE_TYPE_CONFIG_FIELDS}
        result[table] = TableTypeConfig(**kwargs)
    return result


def generate_test_cases(
    file_bytes: bytes,
    selected_categories: list[str],
    table_type_configs: dict[str, dict[str, Any]] | None = None,
    mapping_sheet_name: str | None = None,
    joins_sheet_name: str | None = None,
) -> dict[str, Any]:
    raw_sheets = read_all_sheets_raw(file_bytes)
    sheet_datas = {name: extract_sheet_data(aoa, name) for name, aoa in raw_sheets.items()}

    classification = classify_sheets(sheet_datas)
    mapping_name = mapping_sheet_name or classification.mapping_sheet_name
    joins_name = joins_sheet_name or classification.joins_sheet_name

    mapping_sheet = sheet_datas.get(mapping_name) if mapping_name else None
    joins_sheet = sheet_datas.get(joins_name) if joins_name else None

    mapping_columns = detect_columns(mapping_sheet.headers, MAPPING_FIELD_ALIASES) if mapping_sheet else []
    join_columns = detect_columns(joins_sheet.headers, JOIN_FIELD_ALIASES) if joins_sheet else []

    mapping_rows = build_mapping_rows(mapping_sheet, mapping_columns) if mapping_sheet else []
    join_filter_rows = build_join_filter_rows(joins_sheet, join_columns) if joins_sheet else []

    join_index = build_join_index(join_filter_rows)
    mapping_rows_by_target_table = group_mapping_rows_by_target_table(mapping_rows)

    ctx = GeneratorContext(
        mapping_rows_by_target_table=mapping_rows_by_target_table,
        join_index=join_index,
        all_mapping_rows=mapping_rows,
        table_type_configs=_parse_table_type_configs(table_type_configs),
    )

    test_cases = run_generators(selected_categories, ctx)
    rtm = build_rtm(mapping_rows, test_cases)

    return {
        "sheetNames": list(raw_sheets.keys()),
        "mappingSheetName": mapping_name,
        "joinsSheetName": joins_name,
        "ambiguous": classification.ambiguous,
        "mappingRowCount": len(mapping_rows),
        "testCases": [tc.to_json() for tc in test_cases],
        "rtm": [e.to_json() for e in rtm],
    }
