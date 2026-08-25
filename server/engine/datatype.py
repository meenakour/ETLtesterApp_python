"""Direct port of src/lib/datatype.ts."""

import re

DatatypeClass = str  # 'string' | 'numeric' | 'date' | 'boolean' | 'unknown'


def classify_datatype(raw: str) -> DatatypeClass:
    text = raw.lower()
    if re.search(r"\b(bool|boolean|bit|flag)\b", text):
        return "boolean"
    if re.search(r"\b(date|timestamp|datetime|time)\b", text):
        return "date"
    if re.search(r"\b(char|varchar|string|text|nchar|nvarchar)\b", text):
        return "string"
    if re.search(r"\b(int|integer|bigint|smallint|tinyint|decimal|numeric|double|float|real|long|short|byte|number)\b", text):
        return "numeric"
    return "unknown"


def parse_length(raw: str) -> int | None:
    match = re.search(r"\((\d+)\)", raw)
    return int(match.group(1)) if match else None


def parse_decimal_scale(raw: str) -> int | None:
    match = re.search(r"\(\s*\d+\s*,\s*(\d+)\s*\)", raw)
    return int(match.group(1)) if match else None
