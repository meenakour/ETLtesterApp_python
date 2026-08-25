import * as XLSX from 'xlsx';
import type { TestCase, TestCategory, Priority } from '@/types/testCase';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '@/types/testCase';
import type { MappingRow } from '@/types/mapping';
import { buildRtm } from '@/lib/rtm';

type TestCaseRow = {
  'Test Case ID': string;
  'Test Case Name': string;
  Category: string;
  Priority: string;
  Description: string;
  'Test Steps': string;
  'Expected Result': string;
  'SQL Query': string;
  'Target Table': string;
  'Critical Data Element': string;
  'Manual Review Required': string;
  'Dashboard Comparison': string;
};

/**
 * Expands each test case into one row per step: the common fields (ID, name, description, SQL, etc.)
 * are populated only on the first (top) row of the block and left blank on subsequent step rows.
 */
function buildTestCaseRows(testCases: TestCase[]): TestCaseRow[] {
  const rows: TestCaseRow[] = [];

  for (const tc of testCases) {
    const steps = tc.steps.length > 0 ? tc.steps : [''];

    steps.forEach((step, i) => {
      rows.push({
        'Test Case ID': i === 0 ? tc.id : '',
        'Test Case Name': i === 0 ? tc.name : '',
        Category: i === 0 ? CATEGORY_LABELS[tc.category] : '',
        Priority: i === 0 ? PRIORITY_LABELS[tc.priority] : '',
        Description: i === 0 ? tc.description : '',
        'Test Steps': `${i + 1}. ${step}`,
        'Expected Result': i === 0 ? tc.expectedResult : '',
        'SQL Query': i === 0 ? tc.sql : '',
        'Target Table': i === 0 ? tc.targetTable : '',
        'Critical Data Element': i === 0 ? (tc.isCde ? 'Yes' : 'No') : '',
        'Manual Review Required': i === 0 ? (tc.isManualReview ? 'Yes' : 'No') : '',
        'Dashboard Comparison': i === 0 ? (tc.isDashboardComparison ? 'Yes' : 'No') : '',
      });
    });
  }

  return rows;
}

const COLUMN_WIDTHS = [
  { wch: 14 },
  { wch: 32 },
  { wch: 26 },
  { wch: 16 },
  { wch: 42 },
  { wch: 42 },
  { wch: 38 },
  { wch: 65 },
  { wch: 20 },
  { wch: 14 },
  { wch: 14 },
  { wch: 16 },
];

const RTM_COLUMN_WIDTHS = [
  { wch: 12 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 34 },
  { wch: 8 },
  { wch: 10 },
  { wch: 12 },
  { wch: 26 },
  { wch: 12 },
];

export function exportTestCasesToExcel(
  testCases: TestCase[],
  mappingRows: MappingRow[],
  filename = 'etl_test_cases.xlsx'
): void {
  const wb = XLSX.utils.book_new();

  const mainRows = buildTestCaseRows(testCases);
  const mainSheet = XLSX.utils.json_to_sheet(mainRows);
  mainSheet['!cols'] = COLUMN_WIDTHS;
  XLSX.utils.book_append_sheet(wb, mainSheet, 'Test Cases');

  const categoryCounts: Partial<Record<TestCategory, number>> = {};
  const priorityCounts: Partial<Record<Priority, number>> = {};
  for (const tc of testCases) {
    categoryCounts[tc.category] = (categoryCounts[tc.category] ?? 0) + 1;
    priorityCounts[tc.priority] = (priorityCounts[tc.priority] ?? 0) + 1;
  }
  const summaryRows: Record<string, string | number>[] = Object.entries(categoryCounts).map(([category, count]) => ({
    Metric: CATEGORY_LABELS[category as TestCategory],
    Count: count,
  }));
  summaryRows.push({ Metric: '', Count: '' });
  for (const [priority, count] of Object.entries(priorityCounts)) {
    summaryRows.push({ Metric: PRIORITY_LABELS[priority as Priority], Count: count });
  }
  summaryRows.push({ Metric: '', Count: '' });
  summaryRows.push({ Metric: 'TOTAL', Count: testCases.length });
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const manualReviewTestCases = testCases.filter((tc) => tc.isManualReview);
  if (manualReviewTestCases.length > 0) {
    const manualReviewRows = buildTestCaseRows(manualReviewTestCases);
    const manualSheet = XLSX.utils.json_to_sheet(manualReviewRows);
    manualSheet['!cols'] = COLUMN_WIDTHS;
    XLSX.utils.book_append_sheet(wb, manualSheet, 'Manual Review');
  }

  const rtm = buildRtm(mappingRows, testCases);
  const rtmRows = rtm.map((entry) => ({
    'Requirement ID': entry.requirementId,
    'Source Table': entry.sourceTable,
    'Source Field': entry.sourceField,
    'Target Table': entry.targetTable,
    'Target Field': entry.targetField,
    Transformation: entry.transformation || 'Same as source',
    'Primary Key': entry.isPrimaryKey ? 'Y' : 'N',
    Nullable: entry.isNullable ? 'Y' : 'N',
    'Test Case Count': entry.testCaseCount,
    'Covered Test Case IDs': entry.coveredTestCaseIds.join(', '),
    'Coverage Status': entry.covered ? 'Covered' : 'GAP - Not Covered',
  }));
  const rtmSheet = XLSX.utils.json_to_sheet(rtmRows);
  rtmSheet['!cols'] = RTM_COLUMN_WIDTHS;
  XLSX.utils.book_append_sheet(wb, rtmSheet, 'RTM');

  XLSX.writeFile(wb, filename);
}
