import type { MappingRow } from '@/types/mapping';
import type { TestCase, TestCategory } from '@/types/testCase';
import { TEST_CATEGORIES } from '@/types/testCase';

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

export interface CategoryRtmGroup {
  category: TestCategory;
  testCaseCount: number;
  coveredMappingRowCount: number;
  /** Every mapping row, with coverage fields (coveredTestCaseIds/testCaseCount/covered) scoped to
   *  just this category's test cases -- not the global "covered by anything" flag. */
  entries: RtmEntry[];
}

/**
 * Groups RTM coverage by test category instead of one row per mapping field -- a flat per-row
 * table gets unwieldy fast on a real mapping doc with dozens of fields across nine categories.
 * `requirementId` in buildRtm is derived only from mappingRows' own index, never from testCases,
 * so calling buildRtm once per category (scoped to that category's test cases) yields identical,
 * stable REQ-IDs across every group -- safe to call repeatedly.
 */
export function buildRtmByCategory(mappingRows: MappingRow[], testCases: TestCase[]): CategoryRtmGroup[] {
  const groups: CategoryRtmGroup[] = [];
  for (const category of TEST_CATEGORIES) {
    const categoryTestCases = testCases.filter((tc) => tc.category === category);
    if (categoryTestCases.length === 0) continue; // nothing to show for a category the user didn't generate
    const entries = buildRtm(mappingRows, categoryTestCases);
    groups.push({
      category,
      testCaseCount: categoryTestCases.length,
      coveredMappingRowCount: entries.filter((e) => e.covered).length,
      entries,
    });
  }
  return groups;
}
