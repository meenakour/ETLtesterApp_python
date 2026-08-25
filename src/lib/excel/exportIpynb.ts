import type { TestCase } from '@/types/testCase';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '@/types/testCase';
import { downloadTextFile } from '@/utils/download';

/** nbformat source is a list of lines, each ending in '\n' except the last. */
function toSource(text: string): string[] {
  const lines = text.split('\n');
  return lines.map((line, i) => (i < lines.length - 1 ? `${line}\n` : line));
}

function markdownCell(text: string) {
  return {
    cell_type: 'markdown',
    metadata: {},
    source: toSource(text),
  };
}

function codeCell(text: string) {
  return {
    cell_type: 'code',
    execution_count: null,
    metadata: {},
    outputs: [],
    source: toSource(text),
  };
}

function buildTestCaseCellSource(tc: TestCase): string {
  const commentLines = [
    `${tc.id}: ${tc.name}`,
    `Category: ${CATEGORY_LABELS[tc.category]} | Priority: ${PRIORITY_LABELS[tc.priority]}${tc.isManualReview ? ' | MANUAL REVIEW REQUIRED' : ''}${tc.isCde ? ' | CDE' : ''}`,
    '',
    `Description: ${tc.description}`,
    '',
    'Steps:',
    ...tc.steps.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    `Expected Result: ${tc.expectedResult}`,
  ]
    .flatMap((line) => line.split('\n'))
    .map((line) => (line ? `-- ${line}` : '--'))
    .join('\n');

  // Leading %sql marks this cell as a SQL cell when imported into a Databricks notebook,
  // regardless of the notebook's default (Python) kernel — the standard way Databricks
  // mixes SQL cells into an .ipynb notebook.
  return `%sql\n${commentLines}\n\n${tc.sql}`;
}

/**
 * Exports test cases as a Jupyter (.ipynb) notebook — one code cell per test case, each
 * prefixed with a %sql magic line so it runs as SQL when imported into Databricks (or any
 * Jupyter environment with a SQL-magic extension loaded).
 */
export function exportIpynbNotebook(testCases: TestCase[], filename = 'etl_test_cases.ipynb'): void {
  const titleCell = markdownCell(
    [
      '# ETL Test Case Suite',
      '',
      `${testCases.length} test case(s) generated. Each cell below is one independently runnable test case (run via a SQL warehouse/cluster).`,
    ].join('\n')
  );

  const notebook = {
    cells: [titleCell, ...testCases.map((tc) => codeCell(buildTestCaseCellSource(tc)))],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };

  downloadTextFile(JSON.stringify(notebook, null, 1), filename, 'application/x-ipynb+json');
}
