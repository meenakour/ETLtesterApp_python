"""Direct port of src/lib/generators/businessRuleHeuristics.ts."""

from __future__ import annotations

import re
from dataclasses import dataclass

TRANSFORMATION_STRATEGIES = (
    "DIRECT_COPY",
    "CASE_EXPRESSION",
    "DEFAULT_OR_LOOKUP",
    "CONCAT_EXPRESSION",
    "DIRECT_SQL_FUNCTION",
    "ARITHMETIC_EXPRESSION",
    "MANUAL_REVIEW",
)


@dataclass
class TransformationClassification:
    strategy: str
    expression: str | None
    raw_text: str


_TRIVIAL_SENTINELS = {
    "same as source",
    "direct map",
    "direct mapping",
    "1:1",
    "no transformation",
    "no transformation required",
    "copy",
    "as-is",
    "as is",
    "direct copy",
    "none",
    "-",
    "n/a",
}

_SQL_KEYWORDS = {
    "case", "when", "then", "else", "end", "and", "or", "not", "null", "as", "is", "in", "like", "between",
    "date", "string", "int", "integer", "bigint", "smallint", "tinyint", "decimal", "numeric", "double",
    "float", "real", "timestamp", "boolean", "varchar", "char", "long", "short", "byte", "binary", "array",
    "map", "struct",
}

_WHITELISTED_FUNCTIONS = {
    "substr", "substring", "trim", "ltrim", "rtrim", "cast", "upper", "lower", "round", "replace",
    "concat", "coalesce", "nvl", "ifnull", "to_date", "date_format", "length", "abs",
}

_AGGREGATE_FUNCTIONS = {"sum", "avg", "count", "min", "max"}


def _is_balanced_parens(text: str) -> bool:
    depth = 0
    for ch in text:
        if ch == "(":
            depth += 1
        if ch == ")":
            depth -= 1
        if depth < 0:
            return False
    return depth == 0


def _strip_string_literals(text: str) -> str:
    text = re.sub(r"'[^']*'", "''", text)
    text = re.sub(r'"[^"]*"', '""', text)
    return text


def _contains_only_whitelisted_tokens(text: str, known_fields: list[str], allow_aggregates: bool) -> bool:
    known_field_set = {f.lower() for f in known_fields}
    without_literals = _strip_string_literals(text)
    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", without_literals)
    for tok in tokens:
        lower = tok.lower()
        if (
            lower in known_field_set
            or lower in _SQL_KEYWORDS
            or lower in _WHITELISTED_FUNCTIONS
            or (allow_aggregates and lower in _AGGREGATE_FUNCTIONS)
        ):
            continue
        return False
    return True


def is_safe_sql_expression(text: str, known_fields: list[str], allow_aggregates: bool = False) -> bool:
    return _is_balanced_parens(text) and _contains_only_whitelisted_tokens(text, known_fields, allow_aggregates)


def _is_trivial(text: str) -> bool:
    return text.strip().lower() in _TRIVIAL_SENTINELS


def _try_case_expression(text: str) -> str | None:
    if re.search(r"\bcase\b[\s\S]*\bwhen\b[\s\S]*\bend\b", text, re.IGNORECASE):
        return text.strip()
    match = re.match(r"^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+?))?$", text.strip(), re.IGNORECASE)
    if match:
        condition, then_val, else_val = match.groups()
        else_clause = f" ELSE {else_val.strip()}" if else_val else ""
        return f"CASE WHEN {condition.strip()} THEN {then_val.strip()}{else_clause} END"
    return None


def _try_default_or_lookup(text: str) -> str | None:
    if re.search(r"\bcoalesce\s*\(", text, re.IGNORECASE):
        return text.strip()
    match = re.match(r"^(.+?)\s+defaults?\s+to\s+(.+)$", text, re.IGNORECASE)
    if match:
        source_expr, default_val = match.groups()
        return f"COALESCE({source_expr.strip()}, {default_val.strip()})"
    return None


def _try_concat_expression(text: str) -> str | None:
    if re.search(r"\bconcat\s*\(", text, re.IGNORECASE):
        return text.strip()
    if "||" in text:
        parts = [p.strip() for p in text.split("||") if p.strip()]
        if len(parts) >= 2:
            return f"CONCAT({', '.join(parts)})"
    if "+" in text and re.search(r"'[^']*'", text):
        parts = [p.strip() for p in text.split("+") if p.strip()]
        if len(parts) >= 2:
            return f"CONCAT({', '.join(parts)})"
    return None


def _try_direct_sql_function(text: str, allow_aggregates: bool) -> str | None:
    functions = _WHITELISTED_FUNCTIONS | _AGGREGATE_FUNCTIONS if allow_aggregates else _WHITELISTED_FUNCTIONS
    pattern = r"\b(" + "|".join(functions) + r")\s*\("
    if re.search(pattern, text, re.IGNORECASE):
        return text.strip()
    return None


def _try_arithmetic_expression(text: str) -> str | None:
    trimmed = text.strip()
    if re.match(r"^[A-Za-z0-9_.\s+\-*/%()]+$", trimmed) and re.search(r"[+\-*/%]", trimmed):
        return trimmed
    return None


def classify_transformation(
    raw_text: str, known_fields: list[str], allow_aggregates: bool = False
) -> TransformationClassification:
    text = raw_text.strip()

    if not text or _is_trivial(text):
        return TransformationClassification(strategy="DIRECT_COPY", expression=None, raw_text=raw_text)

    attempts = [
        ("CASE_EXPRESSION", _try_case_expression(text)),
        ("DEFAULT_OR_LOOKUP", _try_default_or_lookup(text)),
        ("CONCAT_EXPRESSION", _try_concat_expression(text)),
        ("DIRECT_SQL_FUNCTION", _try_direct_sql_function(text, allow_aggregates)),
        ("ARITHMETIC_EXPRESSION", _try_arithmetic_expression(text)),
    ]

    for strategy, expression in attempts:
        if expression is None:
            continue
        if not _is_balanced_parens(expression):
            continue
        if not _contains_only_whitelisted_tokens(expression, known_fields, allow_aggregates):
            continue
        return TransformationClassification(strategy=strategy, expression=expression, raw_text=raw_text)

    return TransformationClassification(strategy="MANUAL_REVIEW", expression=None, raw_text=raw_text)


def qualify_field_references(expression: str, known_fields: list[str], alias: str) -> str:
    result = expression
    sorted_fields = sorted((f for f in known_fields if f), key=len, reverse=True)
    for field in sorted_fields:
        escaped = re.escape(field)
        pattern = re.compile(rf"(?<!['\"`\w]){escaped}(?!['\"`\w])", re.IGNORECASE)
        # A lambda replacement (rather than a plain replacement string) keeps this a literal
        # substitution regardless of what characters happen to be in `field` -- re.sub treats a
        # string replacement's backslashes as backreference escapes, which a literal field name
        # should never be interpreted as.
        result = pattern.sub(lambda _match, f=field: f"{alias}.`{f}`", result)
    return result
