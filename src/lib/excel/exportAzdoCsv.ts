import type { TestCase } from '@/types/testCase';
import { downloadTextFile } from '@/utils/download';

/**
 * Fields Azure DevOps / the org's test-case import process needs on every row that this app
 * cannot infer from a mapping document (org hierarchy, ownership, tooling conventions). Collected
 * once via a form and stamped onto every generated row, rather than left blank for the user to
 * fill in by hand across potentially hundreds of rows.
 */
export interface AzdoExportSettings {
  workItemType: string;
  areaPath: string;
  assignedTo: string;
  iterationPath: string;
  appEaiCode: string;
  eaiCode: string;
  toolsUsed: string;
  automationStatus: string;
  state: string;
}

export const DEFAULT_AZDO_SETTINGS: AzdoExportSettings = {
  workItemType: 'Test Case',
  areaPath: '',
  assignedTo: '',
  iterationPath: '',
  appEaiCode: '',
  eaiCode: '',
  toolsUsed: 'Databricks SQL',
  automationStatus: 'Not Automated',
  state: 'Design',
};

export const AZDO_CSV_HEADERS = [
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
];

function csvEscape(value: string): string {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface AzdoStep {
  action: string;
  expected: string;
}

/** The test case's own steps as plain actions, plus one final step that runs the actual SQL and carries the expected result. */
function buildAzdoSteps(tc: TestCase): AzdoStep[] {
  const descriptionSteps: AzdoStep[] = tc.steps.map((step) => ({ action: step, expected: '' }));
  const sqlStep: AzdoStep = { action: `Run this SQL query:\n${tc.sql}`, expected: tc.expectedResult };
  return [...descriptionSteps, sqlStep];
}

export function buildAzdoCsvRows(testCases: TestCase[], settings: AzdoExportSettings): string[][] {
  const rows: string[][] = [];
  for (const tc of testCases) {
    const title = `[${tc.id}] ${tc.name}`;
    buildAzdoSteps(tc).forEach((step, index) => {
      rows.push([
        '', // ID left blank -> the import process creates a new work item
        settings.workItemType,
        title,
        String(index + 1),
        step.action,
        step.expected,
        settings.appEaiCode,
        settings.eaiCode,
        settings.automationStatus,
        settings.toolsUsed,
        settings.areaPath,
        settings.assignedTo,
        settings.iterationPath,
        settings.state,
      ]);
    });
  }
  return rows;
}

export function exportAzdoCsv(testCases: TestCase[], settings: AzdoExportSettings, filename = 'azdo_test_cases.csv'): void {
  const rows = buildAzdoCsvRows(testCases, settings);
  const csv = [AZDO_CSV_HEADERS, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  downloadTextFile(csv, filename, 'text/csv');
}
