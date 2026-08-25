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
