/**
 * Safety net for whole SQL queries proposed by the prompt-driven AI test-case generator
 * (generateTestCasesFromPrompt.ts). Deliberately NOT businessRuleHeuristics.ts's
 * isSafeSqlExpression, which is a token WHITELIST built for one bare expression (no SELECT/FROM)
 * -- it would reject every legitimate full query this feature returns. This is a BLOCKLIST
 * instead: the app never executes generated SQL itself (every test case's SQL is display/export
 * text a tester copies into their own Databricks/Spark session), so the real risk isn't in-app
 * injection, it's showing something destructive-looking that gets copy/pasted into a real
 * environment. A blocklist targets exactly that risk without rejecting legitimate SQL vocabulary
 * (JOIN, GROUP BY, aggregate functions, ...) a whole query legitimately needs.
 */

const MAX_SQL_LENGTH = 4000;

const BLOCKED_KEYWORDS = [
  'DROP',
  'DELETE',
  'INSERT',
  'UPDATE',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'CALL',
];

const BLOCKED_KEYWORD_PATTERN = new RegExp(`\\b(${BLOCKED_KEYWORDS.join('|')})\\b`, 'i');

export function isSafeGeneratedSql(sql: string): boolean {
  const trimmed = sql.trim();
  if (!trimmed || trimmed.length > MAX_SQL_LENGTH) return false;
  if (BLOCKED_KEYWORD_PATTERN.test(trimmed)) return false;

  // Statement-stacking: a semicolon followed by any further non-whitespace content. A single
  // trailing semicolon (with nothing after it) is fine.
  const semicolonIndex = trimmed.indexOf(';');
  if (semicolonIndex !== -1 && trimmed.slice(semicolonIndex + 1).trim().length > 0) return false;

  return true;
}
