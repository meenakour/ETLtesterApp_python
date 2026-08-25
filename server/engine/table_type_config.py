"""Direct port of the `getTableTypeConfig` helper in src/types/tableTypeConfig.ts."""

from engine.models import DEFAULT_TABLE_TYPE_CONFIG, TableTypeConfig


def get_table_type_config(configs: dict[str, TableTypeConfig], target_table: str) -> TableTypeConfig:
    return configs.get(target_table, DEFAULT_TABLE_TYPE_CONFIG)
