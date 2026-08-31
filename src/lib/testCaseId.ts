import { CATEGORY_PREFIX, TEST_CATEGORIES } from '@/types/testCase';
import type { TestCase } from '@/types/testCase';

export function assignSequentialIds(testCases: TestCase[]): TestCase[] {
  const categoryOrder = new Map(TEST_CATEGORIES.map((c, i) => [c, i]));

  const sorted = [...testCases].sort((a, b) => {
    const catDiff = (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0);
    if (catDiff !== 0) return catDiff;
    const tableDiff = a.targetTable.localeCompare(b.targetTable);
    if (tableDiff !== 0) return tableDiff;
    return a.name.localeCompare(b.name);
  });

  const counters: Partial<Record<string, number>> = {};

  return sorted.map((tc) => {
    const prefix = CATEGORY_PREFIX[tc.category];
    const next = (counters[prefix] ?? 0) + 1;
    counters[prefix] = next;
    return { ...tc, id: `TC-${prefix}-${String(next).padStart(3, '0')}` };
  });
}

/**
 * Computes the next available id for a single new test case being appended to an existing list
 * (e.g. approving one AI-proposed case on the Manual & AI Review tab). Deliberately NOT
 * `assignSequentialIds` -- that function resorts and fully renumbers the ENTIRE array every call,
 * which would silently reassign every other already-displayed/exported case's id whenever a new
 * one happens to sort earlier. This only ever computes the one new id, leaving every existing
 * case's id untouched.
 */
export function assignNextIdForCategory(category: TestCase['category'], existing: TestCase[]): string {
  const prefix = CATEGORY_PREFIX[category];
  const pattern = new RegExp(`^TC-${prefix}-(\\d+)$`);
  const maxExisting = existing.reduce((max, tc) => {
    const match = pattern.exec(tc.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `TC-${prefix}-${String(maxExisting + 1).padStart(3, '0')}`;
}
