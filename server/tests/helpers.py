"""Shared test fixtures, mirroring src/lib/generators/testHelpers.ts."""

from __future__ import annotations

from itertools import count

from engine.associate_joins import build_join_index, group_mapping_rows_by_target_table
from engine.models import GeneratorContext, JoinFilterRow, MappingRow, TableTypeConfig

_row_counter = count(1)


def make_mapping_row(**overrides) -> MappingRow:
    n = next(_row_counter)
    defaults = dict(
        id=f"row-{n}",
        source_field="",
        source_table="",
        source_schema="",
        transformation="",
        target_field="",
        target_table="",
        target_schema="",
        source_datatype="",
        target_datatype="",
        is_primary_key=False,
        is_nullable=True,
        raw_row={},
        sheet_row_number=n + 1,
    )
    defaults.update(overrides)
    return MappingRow(**defaults)


_join_counter = count(1)


def make_join(**overrides) -> JoinFilterRow:
    n = next(_join_counter)
    defaults = dict(id=f"join-{n}", table_name="", tables_involved=[], raw_row={}, sheet_row_number=n + 1)
    defaults.update(overrides)
    return JoinFilterRow(**defaults)


def build_context(
    rows: list[MappingRow], join_rows: list[JoinFilterRow] | None = None, table_type_configs: dict[str, TableTypeConfig] | None = None
) -> GeneratorContext:
    return GeneratorContext(
        mapping_rows_by_target_table=group_mapping_rows_by_target_table(rows),
        join_index=build_join_index(join_rows or []),
        all_mapping_rows=rows,
        table_type_configs=table_type_configs or {},
    )
