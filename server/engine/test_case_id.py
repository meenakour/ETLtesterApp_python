"""Direct port of src/lib/testCaseId.ts."""

from __future__ import annotations

from engine.models import CATEGORY_PREFIX, TEST_CATEGORIES, TestCase


def assign_sequential_ids(test_cases: list[TestCase]) -> list[TestCase]:
    category_order = {c: i for i, c in enumerate(TEST_CATEGORIES)}

    def sort_key(tc: TestCase):
        return (category_order.get(tc.category, 0), tc.target_table, tc.name)

    sorted_cases = sorted(test_cases, key=sort_key)

    counters: dict[str, int] = {}
    result: list[TestCase] = []
    for tc in sorted_cases:
        prefix = CATEGORY_PREFIX[tc.category]
        next_count = counters.get(prefix, 0) + 1
        counters[prefix] = next_count
        tc.id = f"TC-{prefix}-{next_count:03d}"
        result.append(tc)
    return result
