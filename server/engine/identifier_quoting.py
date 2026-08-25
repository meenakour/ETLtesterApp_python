"""Direct port of src/lib/sql/identifierQuoting.ts."""


def _quote_identifier_part(part: str) -> str:
    trimmed = part.strip()
    if not trimmed:
        return trimmed
    return "`" + trimmed.replace("`", "``") + "`"


def qualified_table(schema: str | None, table: str) -> str:
    table_part = _quote_identifier_part(table or "unknown_table")
    if schema and schema.strip():
        return f"{_quote_identifier_part(schema)}.{table_part}"
    return table_part


def qualified_column(alias: str, field: str) -> str:
    return f"{alias}.`{field.replace('`', '``')}`"


def quote_column(field: str) -> str:
    return "`" + field.replace("`", "``") + "`"
