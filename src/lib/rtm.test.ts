import { describe, expect, it } from 'vitest';
import { buildRtm } from '@/lib/rtm';
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
    sourceDatatype: '',
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
    id: 'TC-RC-001',
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
  it('assigns sequential requirement IDs in mapping-row order', () => {
    const rows = [makeMappingRow({ id: 'row-1' }), makeMappingRow({ id: 'row-2' })];
    const rtm = buildRtm(rows, []);
    expect(rtm.map((e) => e.requirementId)).toEqual(['REQ-001', 'REQ-002']);
  });

  it('marks a requirement covered when a test case references its mapping row ID', () => {
    const rows = [makeMappingRow({ id: 'row-1' })];
    const testCases = [makeTestCase({ id: 'TC-RC-001', sourceMappingRowIds: ['row-1'] })];
    const rtm = buildRtm(rows, testCases);
    expect(rtm[0].covered).toBe(true);
    expect(rtm[0].testCaseCount).toBe(1);
    expect(rtm[0].coveredTestCaseIds).toEqual(['TC-RC-001']);
  });

  it('flags a requirement as a coverage gap when no test case references it', () => {
    const rows = [makeMappingRow({ id: 'row-1' })];
    const rtm = buildRtm(rows, []);
    expect(rtm[0].covered).toBe(false);
    expect(rtm[0].testCaseCount).toBe(0);
    expect(rtm[0].coveredTestCaseIds).toEqual([]);
  });

  it('counts a single test case against every mapping row it covers', () => {
    const rows = [makeMappingRow({ id: 'row-1' }), makeMappingRow({ id: 'row-2' })];
    const testCases = [makeTestCase({ id: 'TC-RC-001', sourceMappingRowIds: ['row-1', 'row-2'] })];
    const rtm = buildRtm(rows, testCases);
    expect(rtm[0].covered).toBe(true);
    expect(rtm[1].covered).toBe(true);
  });
});
