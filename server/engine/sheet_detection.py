"""Direct port of src/lib/excel/sheetDetection.ts -- the one module where pandas genuinely earns
its keep, reading every sheet into a DataFrame instead of hand-walking a raw cell grid.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import pandas as pd

from engine.aliases import JOIN_FIELD_ALIASES, MAPPING_FIELD_ALIASES, AliasSpec
from engine.fuzzy_match import header_alias_score, normalize_header
from engine.models import SheetData

MAX_HEADER_SCAN_ROWS = 10
HEADER_MATCH_THRESHOLD = 0.5


def _all_alias_strings(alias_map: dict[str, AliasSpec]) -> list[str]:
    result: list[str] = []
    for spec in alias_map.values():
        result.extend(spec.get("aliases", []))
        result.extend(spec.get("inverse_aliases", []))
    return result


MAPPING_ALIAS_POOL = [normalize_header(a) for a in _all_alias_strings(MAPPING_FIELD_ALIASES)]
JOIN_ALIAS_POOL = [normalize_header(a) for a in _all_alias_strings(JOIN_FIELD_ALIASES)]


def _cell_to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value)


def read_all_sheets_raw(file_bytes: bytes) -> dict[str, list[list[str]]]:
    """Reads every sheet as a raw grid of stringified cell values, dropping fully blank rows --
    mirroring SheetJS's `sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })`.
    """
    sheets = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, header=None, engine="openpyxl")
    result: dict[str, list[list[str]]] = {}
    for name, df in sheets.items():
        aoa: list[list[str]] = []
        for _, row in df.iterrows():
            cells = [_cell_to_str(v) for v in row.tolist()]
            if any(c.strip() for c in cells):
                aoa.append(cells)
        result[name] = aoa
    return result


def _score_row_against_pool(cells: list[str], pool: list[str]) -> float:
    hits = 0.0
    for cell in cells:
        text = normalize_header(cell)
        if not text:
            continue
        best = max([0.0] + [header_alias_score(text, alias) for alias in pool])
        if best >= HEADER_MATCH_THRESHOLD:
            hits += 1
    return hits


def _find_header_row_index(aoa: list[list[str]]) -> int:
    best_index = 0
    best_score = -1.0
    scan_limit = min(MAX_HEADER_SCAN_ROWS, len(aoa))
    for i in range(scan_limit):
        row = aoa[i]
        non_empty_count = sum(1 for c in row if c.strip())
        if non_empty_count == 0:
            continue
        alias_hits = _score_row_against_pool(row, MAPPING_ALIAS_POOL) + _score_row_against_pool(row, JOIN_ALIAS_POOL)
        score = non_empty_count * 0.1 + alias_hits
        if score > best_score:
            best_score = score
            best_index = i
    return best_index


def extract_sheet_data(aoa: list[list[str]], sheet_name: str) -> SheetData:
    if not aoa:
        return SheetData(sheet_name=sheet_name, headers=[], header_row_index=0, rows=[])

    header_row_index = _find_header_row_index(aoa)
    header_row = aoa[header_row_index]
    headers = [h.strip() or f"Column {i + 1}" for i, h in enumerate(header_row)]

    rows: list[dict] = []
    for row in aoa[header_row_index + 1 :]:
        record: dict[str, str] = {}
        for idx, h in enumerate(headers):
            record[h] = row[idx] if idx < len(row) else ""
        rows.append(record)

    return SheetData(sheet_name=sheet_name, headers=headers, header_row_index=header_row_index, rows=rows)


@dataclass
class SheetClassification:
    mapping_sheet_name: str | None
    joins_sheet_name: str | None
    ambiguous: bool


def classify_sheets(sheet_datas: dict[str, SheetData]) -> SheetClassification:
    scores: dict[str, tuple[float, float]] = {}
    for name, data in sheet_datas.items():
        mapping_score = 0.0
        joins_score = 0.0
        for header in data.headers:
            normalized = normalize_header(header)
            if not normalized:
                continue
            m_best = max([0.0] + [header_alias_score(normalized, a) for a in MAPPING_ALIAS_POOL])
            j_best = max([0.0] + [header_alias_score(normalized, a) for a in JOIN_ALIAS_POOL])
            if m_best >= HEADER_MATCH_THRESHOLD:
                mapping_score += m_best
            if j_best >= HEADER_MATCH_THRESHOLD:
                joins_score += j_best
        scores[name] = (mapping_score, joins_score)

    sheet_names = list(sheet_datas.keys())
    if not sheet_names:
        return SheetClassification(None, None, True)
    if len(sheet_names) == 1:
        return SheetClassification(sheet_names[0], None, False)

    ranked_for_mapping = sorted(sheet_names, key=lambda n: scores[n][0], reverse=True)
    mapping_sheet_name = ranked_for_mapping[0]

    ranked_for_joins = sorted(
        [n for n in sheet_names if n != mapping_sheet_name], key=lambda n: scores[n][1], reverse=True
    )
    joins_sheet_name = ranked_for_joins[0] if ranked_for_joins else None

    leader_score = scores[mapping_sheet_name][0]
    runner_up_score = scores[ranked_for_mapping[1]][0] if len(ranked_for_mapping) > 1 else 0.0
    margin = leader_score - runner_up_score
    ambiguous = margin < 0.15 * max(1.0, leader_score)

    return SheetClassification(mapping_sheet_name, joins_sheet_name, ambiguous)
