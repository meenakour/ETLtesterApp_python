"""Direct port of src/lib/excel/columnDetection.ts."""

from dataclasses import dataclass

from engine.aliases import AliasSpec
from engine.fuzzy_match import header_alias_score, normalize_header
from engine.models import DetectedColumn

CONFIDENCE_AUTO_ACCEPT = 0.8
CONFIDENCE_TENTATIVE = 0.5


@dataclass
class _ScoredCandidate:
    header: str
    score: float
    inverted: bool


def detect_columns(headers: list[str], alias_map: dict[str, AliasSpec]) -> list[DetectedColumn]:
    field_keys = list(alias_map.keys())
    normalized_headers = [(h, normalize_header(h)) for h in headers]

    candidates_by_field: dict[str, list[_ScoredCandidate]] = {}
    for field in field_keys:
        spec = alias_map[field]
        candidates: list[_ScoredCandidate] = []
        for raw, normalized in normalized_headers:
            if not normalized:
                continue
            best = 0.0
            for alias in spec.get("aliases", []):
                best = max(best, header_alias_score(normalized, normalize_header(alias)))
            best_inverse = 0.0
            for alias in spec.get("inverse_aliases", []):
                best_inverse = max(best_inverse, header_alias_score(normalized, normalize_header(alias)))
            if best_inverse > best:
                candidates.append(_ScoredCandidate(header=raw, score=best_inverse, inverted=True))
            elif best > 0:
                candidates.append(_ScoredCandidate(header=raw, score=best, inverted=False))
        candidates.sort(key=lambda c: c.score, reverse=True)
        candidates_by_field[field] = candidates

    used_headers: set[str] = set()
    assigned: dict[str, _ScoredCandidate] = {}
    remaining_fields = set(field_keys)

    while remaining_fields:
        best_field: str | None = None
        best_candidate: _ScoredCandidate | None = None
        for field in remaining_fields:
            candidate_list = candidates_by_field.get(field, [])
            top = next((c for c in candidate_list if c.header not in used_headers), None)
            if top and (best_candidate is None or top.score > best_candidate.score):
                best_field = field
                best_candidate = top
        if best_field is None or best_candidate is None:
            break
        assigned[best_field] = best_candidate
        used_headers.add(best_candidate.header)
        remaining_fields.discard(best_field)

    result: list[DetectedColumn] = []
    for field in field_keys:
        candidate = assigned.get(field)
        result.append(
            DetectedColumn(
                field=field,
                matched_header=candidate.header if candidate else None,
                confidence=candidate.score if candidate else 0.0,
                inverted=candidate.inverted if candidate else False,
            )
        )
    return result


def confidence_level(score: float) -> str:
    if score >= CONFIDENCE_AUTO_ACCEPT:
        return "high"
    if score >= CONFIDENCE_TENTATIVE:
        return "medium"
    return "low"
