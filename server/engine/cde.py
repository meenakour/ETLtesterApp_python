"""Direct port of src/lib/cde.ts."""

import re

from engine.etl_system_fields import is_etl_system_field

_CDE_IDENTIFIER_PATTERNS = [r"^id$", r"_id$", r"_key$", r"_number$", r"ssn", r"account_number"]

_CDE_CRITICAL_PATTERNS = [
    r"amount|amt",
    r"balance",
    r"price",
    r"cost",
    r"total",
    r"revenue",
    r"payment",
    r"salary",
    r"fee",
    r"status",
    r"flag",
    r"indicator",
    r"_code$",
]


def is_cde_identifier(field_name: str) -> bool:
    if is_etl_system_field(field_name):
        return False
    return any(re.search(p, field_name, re.IGNORECASE) for p in _CDE_IDENTIFIER_PATTERNS)


def is_critical_data_element(field_name: str) -> bool:
    if is_etl_system_field(field_name):
        return False
    return is_cde_identifier(field_name) or any(re.search(p, field_name, re.IGNORECASE) for p in _CDE_CRITICAL_PATTERNS)
