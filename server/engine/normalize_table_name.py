def normalize_table_name(raw: str | None) -> str:
    if not raw:
        return ""
    text = raw.strip().lower()
    for ch in "`\"[]":
        text = text.replace(ch, "")
    text = text.split(".")[-1]
    return text.strip()
