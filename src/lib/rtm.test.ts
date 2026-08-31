import { describe, expect, it } from 'vitest';
import { buildRtm, buildRtmByCategory } from '@/lib/rtm';
import type { MappingRow } from '@/types/mapping';
import type { TestCase } from '@/types/testCase';

function makeMappingRow(overrides: Partial<MappingRow>): MappingRow {
  return {
    id: 'row-1',
    sourceField: 'src',
    sourceTable: 'src_table',
    sourceSchema: '',
    transformation: '',
    targetField: 'tgt',
    targetTable: 'tgt_table',
    targetSchema: '',
    targetDatatype: '',
    isPrimaryKey: false,
    isNullable: true,
    rawRow: {},
    sheetRowNumber: 2,
    ...overrides,
  };
}

function makeTestCase(overrides: Partial<TestCase>): TestCase {
  return {
    id: 'TC-001',
    name: 'name',
    category: 'ROW_COUNT_RECONCILIATION',
    priority: 'P1',
    description: '',
    steps: [],
    expectedResult: '',
    sql: '',
    targetTable: 'tgt_table',
    sourceMappingRowIds: [],
    ...overrides,
  };
}

describe('buildRtm', () => {
  it('marks a row covered when a test case references it and a gap when nothing does', () => {
    const rows = [makeMappingRow({ id: 'row-1' }), makeMappingRow({ id: 'row-2' })];
    const testCases = [makeTestCase({ id: 'TC-001', sourceMappingRowIds: ['row-1'] })];
    const entries = buildRtm(rows, testCases);
    expect(entries.find((e) => e.mappingRowId === 'row-1')?.covered).toBe(true);
    expect(entries.find((e) => e.mappingRowId === 'row-2')?.covered).toBe(false);
  });
});

describe('buildRtmByCategory', () => {
  it('only includes categories with at least one generated test case', () => {
    const rows = [makeMappingRow({ id: 'row-1' })];
    const testCases = [makeTestCase({ id: 'TC-001', category: 'ROW_COUNT_RECONCILIATION', sourceMappingRowIds: ['row-1'] })];
    const groups = buildRtmByCategory(rows, testCases);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('ROW_COUNT_RECONCILIATION');
    expect(groups[0].testCaseCount).toBe(1);
    expect(groups[0].coveredMappingRowCount).toBe(1);
  });

  it('regression: a mapping row covered by one category but not another is scoped correctly per group, not reusing a global covered flag', () => {
    const rows = [makeMappingRow({ id: 'row-1' }), makeMappingRow({ id: 'row-2' })];
    const testCases = [
      makeTestCase({ id: 'TC-RC-001', category: 'ROW_COUNT_RECONCILIATION', sourceMappingRowIds: ['row-1'] }),
      makeTestCase({ id: 'TC-TV-001', category: 'TRANSFORMATION_VALIDATION', sourceMappingRowIds: ['row-2'] }),
    ];
    const groups = buildRtmByCategory(rows, testCases);

    const rowCountGroup = groups.find((g) => g.category === 'ROW_COUNT_RECONCILIATION')!;
    expect(rowCountGroup.entries.find((e) => e.mappingRowId === 'row-1')?.covered).toBe(true);
    expect(rowCountGroup.entries.find((e) => e.mappingRowId === 'row-2')?.covered).toBe(false);

    const transformGroup = groups.find((g) => g.category === 'TRANSFORMATION_VALIDATION')!;
    expect(transformGroup.entries.find((e) => e.mappingRowId === 'row-1')?.covered).toBe(false);
    expect(transformGroup.entries.find((e) => e.mappingRowId === 'row-2')?.covered).toBe(true);
  });

  it('a row covered by zero categories is excluded from every group\'s covered set, and remains a gap in the flat buildRtm view', () => {
    const rows = [makeMappingRow({ id: 'row-1' }), makeMappingRow({ id: 'row-2' })];
    const testCases = [makeTestCase({ id: 'TC-RC-001', category: 'ROW_COUNT_RECONCILIATION', sourceMappingRowIds: ['row-1'] })];
    const groups = buildRtmByCategory(rows, testCases);
    for (const group of groups) {
      expect(group.entries.find((e) => e.mappingRowId === 'row-2')?.covered).toBe(false);
    }
    const gaps = buildRtm(rows, testCases).filter((e) => !e.covered);
    expect(gaps.map((e) => e.mappingRowId)).toEqual(['row-2']);
  });

  it('requirementId stays stable across groups since it derives from mappingRows index only, not testCases', () => {
    const rows = [makeMappingRow({ id: 'row-1' }), makeMappingRow({ id: 'row-2' })];
    const testCases = [
      makeTestCase({ id: 'TC-RC-001', category: 'ROW_COUNT_RECONCILIATION', sourceMappingRowIds: ['row-1'] }),
      makeTestCase({ id: 'TC-TV-001', category: 'TRANSFORMATION_VALIDATION', sourceMappingRowIds: ['row-2'] }),
    ];
    const groups = buildRtmByCategory(rows, testCases);
    for (const group of groups) {
      expect(group.entries.find((e) => e.mappingRowId === 'row-1')?.requirementId).toBe('REQ-001');
      expect(group.entries.find((e) => e.mappingRowId === 'row-2')?.requirementId).toBe('REQ-002');
    }
  });
});
