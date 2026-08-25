import { describe, expect, it } from 'vitest';
import { buildAzdoCsvRows, AZDO_CSV_HEADERS, DEFAULT_AZDO_SETTINGS } from '@/lib/excel/exportAzdoCsv';
import type { TestCase } from '@/types/testCase';

function makeTestCase(overrides: Partial<TestCase>): TestCase {
  return {
    id: 'TC-RC-001',
    name: 'Row Count Reconciliation: customers -> customers',
    category: 'ROW_COUNT_RECONCILIATION',
    priority: 'P1',
    description: 'desc',
    steps: ['Run the source count query.', 'Run the target count query.'],
    expectedResult: 'Counts match.',
    sql: 'SELECT COUNT(*) FROM customers;',
    targetTable: 'customers',
    sourceMappingRowIds: [],
    ...overrides,
  };
}

describe('AZDO CSV export', () => {
  it('has the exact header order the org import expects', () => {
    expect(AZDO_CSV_HEADERS).toEqual([
      'ID',
      'Work Item Type',
      'Title',
      'Test Step',
      'Step Action',
      'Step Expected',
      'App_EAICode',
      'EAI Code',
      'TestCaseAutomationStatus',
      'ToolsUsed',
      'Area Path',
      'Assigned To',
      'Iteration Path',
      'State',
    ]);
  });

  it('emits one row per description step, plus a final SQL-execution row carrying the expected result', () => {
    const tc = makeTestCase({});
    const rows = buildAzdoCsvRows([tc], DEFAULT_AZDO_SETTINGS);

    // 2 description steps + 1 appended SQL step = 3 rows
    expect(rows).toHaveLength(3);

    const [id, workItemType, title, testStep, stepAction, stepExpected] = [0, 1, 2, 3, 4, 5];

    // ID column is always blank -- a new work item, not an update to an existing one.
    expect(rows.every((r) => r[id] === '')).toBe(true);

    expect(rows[0][testStep]).toBe('1');
    expect(rows[0][stepAction]).toBe('Run the source count query.');
    expect(rows[0][stepExpected]).toBe('');

    expect(rows[1][testStep]).toBe('2');
    expect(rows[1][stepAction]).toBe('Run the target count query.');
    expect(rows[1][stepExpected]).toBe('');

    // Final row: the actual SQL to run, paired with the test case's expected result.
    expect(rows[2][testStep]).toBe('3');
    expect(rows[2][stepAction]).toContain('SELECT COUNT(*) FROM customers;');
    expect(rows[2][stepExpected]).toBe('Counts match.');

    // Title carries the internal test case ID for traceability back to the RTM.
    expect(rows.every((r) => r[title] === '[TC-RC-001] Row Count Reconciliation: customers -> customers')).toBe(true);
    expect(rows.every((r) => r[workItemType] === 'Test Case')).toBe(true);
  });

  it('stamps the user-provided org fields onto every row of every test case', () => {
    const testCases = [makeTestCase({ id: 'TC-RC-001' }), makeTestCase({ id: 'TC-RC-002', steps: [] })];
    const settings = {
      ...DEFAULT_AZDO_SETTINGS,
      areaPath: 'MyProject\\ETL',
      iterationPath: 'MyProject\\Sprint 12',
      assignedTo: 'jane.doe@company.com',
      appEaiCode: 'APP123',
      eaiCode: 'EAI456',
    };
    const rows = buildAzdoCsvRows(testCases, settings);

    const areaPathCol = 10;
    const assignedToCol = 11;
    const iterationPathCol = 12;
    const appEaiCol = 6;
    const eaiCol = 7;

    for (const row of rows) {
      expect(row[areaPathCol]).toBe('MyProject\\ETL');
      expect(row[assignedToCol]).toBe('jane.doe@company.com');
      expect(row[iterationPathCol]).toBe('MyProject\\Sprint 12');
      expect(row[appEaiCol]).toBe('APP123');
      expect(row[eaiCol]).toBe('EAI456');
    }
  });

  it('still emits the SQL-execution row even for a test case with no description steps', () => {
    const tc = makeTestCase({ steps: [] });
    const rows = buildAzdoCsvRows([tc], DEFAULT_AZDO_SETTINGS);
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe('1');
  });
});
