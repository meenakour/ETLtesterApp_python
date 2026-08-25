"""Direct port of src/lib/etlSystemFields.ts."""

import re

_ACTION_WORDS = ["load", "insert", "created", "create", "updated", "update", "modified", "modify", "etl"]
_TIME_WORDS = ["date", "ts", "timestamp", "dt"]


def _is_action_time_combo(name: str) -> bool:
    for action in _ACTION_WORDS:
        for time in _TIME_WORDS:
            combo = f"{action}_{time}"
            if name == combo or name.endswith(f"_{combo}") or name.startswith(f"{combo}_"):
                return True
    return False


def is_etl_system_field(field_name: str) -> bool:
    name = field_name.strip().lower()
    if not name:
        return False
    if re.match(r"^etl_|_etl$", name):
        return True
    if re.match(r"^dw_", name):
        return True
    if re.search(r"data_quality_check|^dq_check$|^dq_flag$|^dq_score$", name):
        return True
    if re.match(r"^(batch|run|job)_id$", name):
        return True
    if re.match(r"^record_source$", name):
        return True
    return _is_action_time_combo(name)
