import type { TestCase } from '@/types/testCase';
import { downloadTextFile } from '@/utils/download';

export function exportSqlBundle(testCases: TestCase[], filename = 'etl_test_cases.sql'): void {
  const content = testCases
    .map(
      (tc) =>
        `-- ${tc.id}: ${tc.name}\n-- Category: ${tc.category} | Priority: ${tc.priority}${tc.isManualReview ? ' [MANUAL REVIEW]' : ''}\n${tc.sql}\n`
    )
    .join('\n');
  downloadTextFile(content, filename, 'text/plain');
}
