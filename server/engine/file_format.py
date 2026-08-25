"""Direct port of src/lib/fileFormat.ts."""

import re

FILE_FORMATS = ["csv", "parquet", "json", "delta"]


def infer_file_format(file_name: str) -> str | None:
    match = re.search(r"\.([a-z0-9]+)$", file_name.strip().lower())
    if not match:
        return None
    ext = match.group(1)
    if ext in ("csv", "tsv"):
        return "csv"
    if ext in ("parquet", "pq"):
        return "parquet"
    if ext in ("json", "jsonl", "ndjson"):
        return "json"
    if ext == "delta":
        return "delta"
    return None


def build_file_path(location: str | None, file_name: str | None) -> str:
    loc = (location or "").strip()
    name = (file_name or "").strip()
    if not loc:
        return name
    if not name:
        return loc
    sep = "" if re.search(r"[/\\]$", loc) else "/"
    return f"{loc}{sep}{name}"
