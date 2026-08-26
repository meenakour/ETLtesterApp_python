// Shared test fixtures for generator tests. Not itself a test file (vitest only picks up *.test.ts).
import { buildJoinIndex, groupMappingRowsByTargetTable } from '@/lib/excel/associateJoins';
import type { MappingRow, JoinFilterRow } from '@/types/mapping';
import type { GeneratorContext } from '@/lib/generators/types';
import type { TableTypeConfig } from '@/types/tableTypeConfig';
import type { TestCase } from '@/types/testCase';

let joinCounter = 0;
export function makeJoin(overrides: Partial<JoinFilterRow>): JoinFilterRow {
  joinCounter += 1;
  return {
    id: `join-${joinCounter}`,
    tableName: '',
    tablesInvolved: [],
    rawRow: {},
    sheetRowNumber: joinCounter + 1,
    ...overrides,
  };
}

let rowCounter = 0;
export function makeMappingRow(overrides: Partial<MappingRow>): MappingRow {
  rowCounter += 1;
  return {
    id: `row-${rowCounter}`,
    sourceField: '',
    sourceTable: '',
    sourceSchema: '',
    transformation: '',
    targetField: '',
    targetTable: '',
    targetSchema: '',
    targetDatatype: '',
    isPrimaryKey: false,
    isNullable: true,
    rawRow: {},
    sheetRowNumber: rowCounter + 1,
    ...overrides,
  };
}

export function buildContext(
  rows: MappingRow[],
  joinRows: JoinFilterRow[] = [],
  tableTypeConfigs: Record<string, TableTypeConfig> = {}
): GeneratorContext {
  return {
    mappingRowsByTargetTable: groupMappingRowsByTargetTable(rows),
    joinIndex: buildJoinIndex(joinRows),
    allMappingRows: rows,
    tableTypeConfigs,
  };
}

export function makeTestCase(overrides: Partial<TestCase>): TestCase {
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
