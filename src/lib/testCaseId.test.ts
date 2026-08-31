import { describe, expect, it } from 'vitest';
import { assignSequentialIds, assignNextIdForCategory } from '@/lib/testCaseId';
import type { TestCase } from '@/types/testCase';

function makeTestCase(overrides: Partial<TestCase>): TestCase {
  return {
    id: 'draft',
    name: 'name',
    category: 'ROW_COUNT_RECONCILIATION',
    priority: 'P1',
    description: '',
    steps: [],
    expectedResult: '',
    sql: '',
    targetTable: 'zzz',
    sourceMappingRowIds: [],
    ...overrides,
  };
}

describe('assignSequentialIds', () => {
  it('assigns category-prefixed, zero-padded, sequential IDs', () => {
    const input = [
      makeTestCase({ category: 'ROW_COUNT_RECONCILIATION', targetTable: 'a' }),
      makeTestCase({ category: 'ROW_COUNT_RECONCILIATION', targetTable: 'b' }),
      makeTestCase({ category: 'DQ_CHECKS', targetTable: 'a' }),
    ];
    const result = assignSequentialIds(input);
    expect(result.map((tc) => tc.id)).toEqual(['TC-RC-001', 'TC-RC-002', 'TC-DQ-001']);
  });

  it('orders test cases by category (declaration order), then target table, then name', () => {
    const input = [
      makeTestCase({ category: 'BUSINESS_RULE', targetTable: 'orders', name: 'z' }),
      makeTestCase({ category: 'ROW_COUNT_RECONCILIATION', targetTable: 'customers', name: 'a' }),
      makeTestCase({ category: 'ROW_COUNT_RECONCILIATION', targetTable: 'accounts', name: 'b' }),
    ];
    const result = assignSequentialIds(input);
    expect(result.map((tc) => `${tc.category}:${tc.targetTable}`)).toEqual([
      'ROW_COUNT_RECONCILIATION:accounts',
      'ROW_COUNT_RECONCILIATION:customers',
      'BUSINESS_RULE:orders',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [makeTestCase({ category: 'DQ_CHECKS' })];
    const result = assignSequentialIds(input);
    expect(input[0].id).toBe('draft');
    expect(result[0].id).toBe('TC-DQ-001');
  });
});

describe('assignNextIdForCategory', () => {
  it('starts at 001 when there are no existing cases in that category', () => {
    expect(assignNextIdForCategory('TRANSFORMATION_VALIDATION', [])).toBe('TC-TV-001');
  });

  it('picks the next number after the highest existing id, not the count', () => {
    const existing = [
      makeTestCase({ id: 'TC-TV-001', category: 'TRANSFORMATION_VALIDATION' }),
      makeTestCase({ id: 'TC-TV-003', category: 'TRANSFORMATION_VALIDATION' }),
    ];
    expect(assignNextIdForCategory('TRANSFORMATION_VALIDATION', existing)).toBe('TC-TV-004');
  });

  it('ignores ids from other categories', () => {
    const existing = [
      makeTestCase({ id: 'TC-RC-005', category: 'ROW_COUNT_RECONCILIATION' }),
      makeTestCase({ id: 'TC-TV-001', category: 'TRANSFORMATION_VALIDATION' }),
    ];
    expect(assignNextIdForCategory('TRANSFORMATION_VALIDATION', existing)).toBe('TC-TV-002');
  });

  it('ignores malformed/foreign-shaped ids rather than throwing', () => {
    const existing = [makeTestCase({ id: 'draft-7', category: 'TRANSFORMATION_VALIDATION' })];
    expect(assignNextIdForCategory('TRANSFORMATION_VALIDATION', existing)).toBe('TC-TV-001');
  });

  it('does not renumber any existing case -- only computes the new id', () => {
    const existing = [makeTestCase({ id: 'TC-TV-001', category: 'TRANSFORMATION_VALIDATION' })];
    assignNextIdForCategory('TRANSFORMATION_VALIDATION', existing);
    expect(existing[0].id).toBe('TC-TV-001');
  });
});
