/**
 * Client for the optional Python/pandas engine (see server/main.py) -- a full server-side
 * re-implementation of this app's own client-side pipeline. Opt-in only: calling this uploads the
 * user's mapping workbook to the server below, which never happens otherwise (the client-side
 * pipeline in lib/generators processes everything locally in the browser).
 */

import type { TableTypeConfig } from '@/types/tableTypeConfig';
import type { TestCase, TestCategory } from '@/types/testCase';

export interface GenerateViaPythonEngineParams {
  serverUrl: string;
  file: File;
  selectedCategories: TestCategory[];
  tableTypeConfigs: Record<string, TableTypeConfig>;
  mappingSheetName: string | null;
  joinsSheetName: string | null;
}

export async function generateTestCasesViaPythonEngine(params: GenerateViaPythonEngineParams): Promise<TestCase[]> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('selected_categories', JSON.stringify(params.selectedCategories));
  form.append('table_type_configs', JSON.stringify(params.tableTypeConfigs));
  if (params.mappingSheetName) form.append('mapping_sheet_name', params.mappingSheetName);
  if (params.joinsSheetName) form.append('joins_sheet_name', params.joinsSheetName);

  const url = `${params.serverUrl.replace(/\/$/, '')}/api/generate-test-cases`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Could not reach the Python engine at ${params.serverUrl}: ${err.message}`
        : `Could not reach the Python engine at ${params.serverUrl}.`
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Python engine responded ${res.status}`);
  }

  const body = await res.json();
  if (!Array.isArray(body.testCases)) {
    throw new Error('Unexpected response shape from the Python engine.');
  }
  return body.testCases as TestCase[];
}
