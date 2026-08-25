"""Direct port of src/lib/fuzzyMatch.ts -- Dice-coefficient + Levenshtein header similarity."""

import re

_STOPWORDS = {"the", "a", "of", "name"}


def normalize_header(raw: str) -> str:
    text = raw.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [t for t in re.split(r"\s+", text) if t and t not in _STOPWORDS]
    return " ".join(tokens)


def _tokenize(s: str) -> list[str]:
    return [t for t in re.split(r"\s+", s) if t]


def _dice_coefficient(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if len(a) < 2 or len(b) < 2:
        return 1.0 if a == b else 0.0

    def bigrams(s: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for i in range(len(s) - 1):
            bg = s[i : i + 2]
            counts[bg] = counts.get(bg, 0) + 1
        return counts

    bigrams_a = bigrams(a)
    bigrams_b = bigrams(b)
    intersection = 0
    for bg, count_a in bigrams_a.items():
        count_b = bigrams_b.get(bg)
        if count_b:
            intersection += min(count_a, count_b)
    total_a = sum(bigrams_a.values())
    total_b = sum(bigrams_b.values())
    if total_a + total_b == 0:
        return 0.0
    return (2 * intersection) / (total_a + total_b)


def _levenshtein(a: str, b: str) -> int:
    m, n = len(a), len(b)
    if m == 0:
        return n
    if n == 0:
        return m
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            dp[j] = prev if a[i - 1] == b[j - 1] else 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[n]


def header_alias_score(header: str, alias: str) -> float:
    """Similarity score in [0, ~1.15] between a normalized header and a normalized alias."""
    max_len = max(len(header), len(alias)) or 1
    dice = _dice_coefficient(header, alias)
    lev = 1 - _levenshtein(header, alias) / max_len
    token_a = set(_tokenize(header))
    token_b = set(_tokenize(alias))
    contains_bonus = 0.15 if (alias in header or header in alias) else 0.0
    token_overlap_bonus = 0.1 if token_b and token_b.issubset(token_a) else 0.0
    return 0.6 * dice + 0.3 * lev + contains_bonus + token_overlap_bonus
