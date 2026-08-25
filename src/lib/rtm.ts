import type { MappingRow } from '@/types/mapping';
import type { TestCase } from '@/types/testCase';

export interface RtmEntry {
  requirementId: string;
  mappingRowId: string;
  sourceTable: string;
  sourceField: string;
  targetTable: string;
  targetField: string;
  transformation: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  coveredTestCaseIds: string[];
  testCaseCount: number;
  covered: boolean;
}

/**
 * Builds a Requirements Traceability Matrix: one row per mapping requirement
 * (a source-to-target field mapping), linked to every generated test case that
 * covers it via TestCase.sourceMappingRowIds. A requirement with zero linked
 * test cases is a coverage gap — surfaced as covered: false.
 */
export function buildRtm(mappingRows: MappingRow[], testCases: TestCase[]): RtmEntry[] {
  const testCasesByMappingRow = new Map<string, TestCase[]>();
  for (const tc of testCases) {
    for (const rowId of tc.sourceMappingRowIds) {
      const list = testCasesByMappingRow.get(rowId) ?? [];
      list.push(tc);
      testCasesByMappingRow.set(rowId, list);
    }
  }

  return mappingRows.map((row, index) => {
    const covering = testCasesByMappingRow.get(row.id) ?? [];
    return {
      requirementId: `REQ-${String(index + 1).padStart(3, '0')}`,
      mappingRowId: row.id,
      sourceTable: row.sourceTable,
      sourceField: row.sourceField,
      targetTable: row.targetTable,
      targetField: row.targetField,
      transformation: row.transformation,
      isPrimaryKey: row.isPrimaryKey,
      isNullable: row.isNullable,
      coveredTestCaseIds: covering.map((tc) => tc.id),
      testCaseCount: covering.length,
      covered: covering.length > 0,
    };
  });
}
