export type TransformationStrategy =
  | 'DIRECT_COPY'
  | 'CASE_EXPRESSION'
  | 'DEFAULT_OR_LOOKUP'
  | 'CONCAT_EXPRESSION'
  | 'DIRECT_SQL_FUNCTION'
  | 'ARITHMETIC_EXPRESSION'
  | 'MANUAL_REVIEW';

export interface TransformationClassification {
  strategy: TransformationStrategy;
  /** SQL expression (unqualified field names) ready to be aliased, or null when not parseable. */
  expression: string | null;
  rawText: string;
}

const TRIVIAL_SENTINELS = new Set([
  'same as source',
  'direct map',
  'direct mapping',
  '1:1',
  'no transformation',
  'no transformation required',
  'copy',
  'as-is',
  'as is',
  'direct copy',
  'none',
  '-',
  'n/a',
]);

const SQL_KEYWORDS = new Set([
  'case', 'when', 'then', 'else', 'end', 'and', 'or', 'not', 'null', 'as', 'is', 'in', 'like', 'between',
  // Bare boolean literals -- e.g. "CASE WHEN active_flag = true THEN ... END" -- are SQL keywords,
  // not user-controllable identifiers, exactly like NULL above; omitting them wrongly rejected an
  // otherwise-fully-recognized CASE expression just for containing the word "true"/"false".
  'true', 'false',
  // SQL type names, needed to whitelist CAST(expr AS <TYPE>) expressions
  'date', 'string', 'int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'double',
  'float', 'real', 'timestamp', 'boolean', 'varchar', 'char', 'long', 'short', 'byte', 'binary', 'array', 'map', 'struct',
]);

const WHITELISTED_FUNCTIONS = new Set([
  'substr', 'substring', 'trim', 'ltrim', 'rtrim', 'cast', 'upper', 'lower', 'round', 'replace',
  'concat', 'coalesce', 'nvl', 'ifnull', 'to_date', 'date_format', 'length', 'abs',
]);

// Only offered to callers that opt in via `allowAggregates` (e.g. the L3 dashboard-KPI generator,
// which computes one summary value across a whole table). Row-level generators must NOT allow
// these -- a bare aggregate has no valid meaning in a per-row correlated comparison and would
// produce broken SQL there.
const AGGREGATE_FUNCTIONS = new Set(['sum', 'avg', 'count', 'min', 'max']);

function isBalancedParens(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Strips single/double-quoted string literals before token-scanning, so literal contents aren't checked. */
function stripStringLiterals(text: string): string {
  return text.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

function containsOnlyWhitelistedTokens(text: string, knownFields: string[], allowAggregates: boolean): boolean {
  const knownFieldSet = new Set(knownFields.map((f) => f.toLowerCase()));
  const withoutLiterals = stripStringLiterals(text);
  const tokens = withoutLiterals.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return tokens.every((tok) => {
    const lower = tok.toLowerCase();
    return (
      knownFieldSet.has(lower) ||
      SQL_KEYWORDS.has(lower) ||
      WHITELISTED_FUNCTIONS.has(lower) ||
      (allowAggregates && AGGREGATE_FUNCTIONS.has(lower))
    );
  });
}

/**
 * Same balanced-parens + token-whitelist gate `classifyTransformation` applies to its own
 * regex-matched candidates, exposed standalone so any OTHER source of a candidate SQL expression
 * (e.g. an LLM-assisted parse of a prose transformation rule) can be validated before being
 * trusted -- never take an external suggestion's word for its own safety.
 */
export function isSafeSqlExpression(text: string, knownFields: string[], allowAggregates = false): boolean {
  return isBalancedParens(text) && containsOnlyWhitelistedTokens(text, knownFields, allowAggregates);
}

function isTrivial(text: string): boolean {
  return TRIVIAL_SENTINELS.has(text.trim().toLowerCase());
}

function tryCaseExpression(text: string): string | null {
  if (/\bcase\b[\s\S]*\bwhen\b[\s\S]*\bend\b/i.test(text)) {
    return text.trim();
  }
  const ifThenMatch = text
    .trim()
    .match(/^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+?))?$/i);
  if (ifThenMatch) {
    const [, condition, thenVal, elseVal] = ifThenMatch;
    const elseClause = elseVal ? ` ELSE ${elseVal.trim()}` : '';
    return `CASE WHEN ${condition.trim()} THEN ${thenVal.trim()}${elseClause} END`;
  }
  return null;
}

function tryDefaultOrLookup(text: string): string | null {
  if (/\bcoalesce\s*\(/i.test(text)) return text.trim();
  const defaultsToMatch = text.match(/^(.+?)\s+defaults?\s+to\s+(.+)$/i);
  if (defaultsToMatch) {
    const [, sourceExpr, defaultVal] = defaultsToMatch;
    return `COALESCE(${sourceExpr.trim()}, ${defaultVal.trim()})`;
  }
  if (/\blookup\b/i.test(text)) return null;
  return null;
}

function tryConcatExpression(text: string): string | null {
  if (/\bconcat\s*\(/i.test(text)) return text.trim();
  if (text.includes('||')) {
    const parts = text.split('||').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return `CONCAT(${parts.join(', ')})`;
  }
  if (text.includes('+') && /'[^']*'/.test(text)) {
    const parts = text.split('+').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return `CONCAT(${parts.join(', ')})`;
  }
  return null;
}

function tryDirectSqlFunction(text: string, allowAggregates: boolean): string | null {
  const functions = allowAggregates ? [...WHITELISTED_FUNCTIONS, ...AGGREGATE_FUNCTIONS] : [...WHITELISTED_FUNCTIONS];
  const fnPattern = new RegExp(`\\b(${functions.join('|')})\\s*\\(`, 'i');
  if (fnPattern.test(text)) return text.trim();
  return null;
}

function tryArithmeticExpression(text: string): string | null {
  const trimmed = text.trim();
  if (/^[A-Za-z0-9_.\s+\-*/%()]+$/.test(trimmed) && /[+\-*/%]/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Deterministically classifies a free-text transformation rule into a SQL-buildable
 * strategy, or MANUAL_REVIEW when it can't be safely turned into SQL. Order matters:
 * first matching strategy wins, then a token-whitelist gate can still downgrade to
 * MANUAL_REVIEW to avoid ever emitting a silently-wrong query.
 */
export function classifyTransformation(
  rawText: string,
  knownFields: string[],
  options: { allowAggregates?: boolean } = {}
): TransformationClassification {
  const allowAggregates = options.allowAggregates ?? false;
  const text = rawText.trim();

  if (!text || isTrivial(text)) {
    return { strategy: 'DIRECT_COPY', expression: null, rawText };
  }

  const attempts: Array<[TransformationStrategy, string | null]> = [
    ['CASE_EXPRESSION', tryCaseExpression(text)],
    ['DEFAULT_OR_LOOKUP', tryDefaultOrLookup(text)],
    ['CONCAT_EXPRESSION', tryConcatExpression(text)],
    ['DIRECT_SQL_FUNCTION', tryDirectSqlFunction(text, allowAggregates)],
    ['ARITHMETIC_EXPRESSION', tryArithmeticExpression(text)],
  ];

  for (const [strategy, expression] of attempts) {
    if (expression === null) continue;
    if (!isBalancedParens(expression)) continue;
    if (!containsOnlyWhitelistedTokens(expression, knownFields, allowAggregates)) continue;
    return { strategy, expression, rawText };
  }

  return { strategy: 'MANUAL_REVIEW', expression: null, rawText };
}

/** Replaces bare occurrences of known field names with `alias`.`field` qualified references. */
export function qualifyFieldReferences(expression: string, knownFields: string[], alias: string): string {
  let result = expression;
  const sortedFields = [...knownFields].sort((a, b) => b.length - a.length);
  for (const field of sortedFields) {
    if (!field) continue;
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<!['"\`\\w])${escaped}(?!['"\`\\w])`, 'gi');
    result = result.replace(pattern, `${alias}.\`${field}\``);
  }
  return result;
}
