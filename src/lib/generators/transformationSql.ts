import type { MappingRow } from '@/types/mapping';
import { quoteColumn, qualifiedColumn } from '@/lib/sql/identifierQuoting';
import { resolveSourceReference, resolveTargetReference } from '@/lib/sql/sourceReference';
import type { TableTypeConfig } from '@/types/tableTypeConfig';
import {
  classifyTransformation,
  qualifyFieldReferences,
  type TransformationClassification,
} from '@/lib/generators/businessRuleHeuristics';

export interface FieldValidationSql {
  sql: string;
  isManualReview: boolean;
  classification: TransformationClassification;
}

interface KeyColumns {
  sourceCols: string[];
  targetCols: string[];
  usedFallbackKey: boolean;
}

/**
 * Some mapping docs cram more than one column into a single Source Column cell (e.g.
 * "column_1,att_1", when a transformation like concat(column_1,att_1) draws from two source
 * columns at once, sometimes across two source tables per the matching Source Table cell). Split
 * on comma/semicolon so each real column name is recoverable individually -- used only to widen
 * the known-field whitelist (§buildKnownFields), never to fabricate a single SQL identifier out of
 * the raw compound string.
 */
function splitCommaTokens(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** True when a field name is a single clean identifier -- not a comma/semicolon-joined compound value that can't be used as a literal SQL column reference. */
function isSingleColumnName(value: string): boolean {
  return value.trim().length > 0 && !/[,;]/.test(value);
}

/** Picks the correlation key -- the declared primary key field(s), or (flagged with a comment) every mapped field as a best-effort fallback when no PK is declared. A compound (comma-joined) Source/Target Column value is never used as a key column -- there's no single real identifier to reference. */
function pickKeyColumns(tableRows: MappingRow[]): KeyColumns {
  const cleanRows = tableRows.filter((r) => isSingleColumnName(r.sourceField) && isSingleColumnName(r.targetField));
  const keyRows = cleanRows.filter((r) => r.isPrimaryKey);
  const effectiveKeyRows = keyRows.length > 0 ? keyRows : cleanRows;
  return {
    sourceCols: effectiveKeyRows.map((r) => r.sourceField),
    targetCols: effectiveKeyRows.map((r) => r.targetField),
    usedFallbackKey: keyRows.length === 0,
  };
}

/**
 * Builds the two separate, independently-runnable source and target queries for a field whose
 * transformation has already been resolved to a validated SQL expression -- shared by the
 * deterministic classifier's happy path below and by the browser-side AI Assist enrichment flow
 * (src/lib/llm/aiAssist.ts), which produces its own candidate expression from an LLM and, after
 * independently validating it against the same known-field/keyword whitelist, builds the exact
 * same query shape a deterministic match would have produced.
 */
export function buildSourceTargetQueries(
  row: MappingRow,
  tableRows: MappingRow[],
  typeConfig: TableTypeConfig,
  qualifiedExpr: string
): string {
  const sourceQualified = resolveSourceReference(typeConfig, tableRows, row.sourceSchema, row.sourceTable);
  const targetQualified = resolveTargetReference(typeConfig, row.targetSchema, row.targetTable);
  const { sourceCols, targetCols, usedFallbackKey } = pickKeyColumns(tableRows);
  const keyComment = usedFallbackKey
    ? `-- NOTE: no primary key flagged for this table; every mapped field is listed so rows can still be correlated by eye.\n`
    : '';

  const sourceKeySelect = sourceCols.map((f) => qualifiedColumn('s', f));
  const targetKeySelect = targetCols.map((f) => qualifiedColumn('t', f));
  const sourceOrderBy = sourceCols.length > 0 ? sourceKeySelect.join(', ') : qualifiedColumn('s', row.sourceField);
  const targetOrderBy = targetCols.length > 0 ? targetKeySelect.join(', ') : qualifiedColumn('t', row.targetField);

  const sourceSql = [
    `${keyComment}-- SOURCE query: derived_target_value is what the transformation should produce.`,
    `SELECT ${[...sourceKeySelect, `${qualifiedExpr} AS derived_target_value`].join(', ')}`,
    `FROM ${sourceQualified} s`,
    `ORDER BY ${sourceOrderBy};`,
  ].join('\n');

  const targetSql = [
    `-- TARGET query: actual_target_value is what was actually loaded -- compare rows by key against the source query above.`,
    `SELECT ${[...targetKeySelect, `${qualifiedColumn('t', row.targetField)} AS actual_target_value`].join(', ')}`,
    `FROM ${targetQualified} t`,
    `ORDER BY ${targetOrderBy};`,
  ].join('\n');

  return `${sourceSql}\n\n${targetSql}`;
}

/**
 * A transformation formula routinely references columns that aren't *this* row's own declared
 * source field: a sibling source column mapped elsewhere in the doc (e.g. "last_name" feeding a
 * "full_name" row whose own Source Field is "first_name"), or another already-computed target
 * column from this same table group (e.g. "discount_pct" derived from a target field
 * "order_total" that a different row already produces). Restricting knownFields to only this
 * row's own group's source fields rejected both patterns and forced them to MANUAL_REVIEW even
 * though the SQL was perfectly valid -- so the whitelist covers every source field mapped
 * anywhere in the workbook plus every target field within this table group. Exported so the
 * browser-side AI Assist flow validates an LLM's suggested expression against the identical set.
 */
export function buildKnownFields(tableRows: MappingRow[], allMappingRows: MappingRow[]): string[] {
  return [
    ...tableRows.map((r) => r.sourceField),
    ...tableRows.map((r) => r.targetField),
    ...allMappingRows.map((r) => r.sourceField),
  ]
    .filter(Boolean)
    .flatMap(splitCommaTokens);
}

export function buildFieldValidationSql(
  row: MappingRow,
  tableRows: MappingRow[],
  typeConfig: TableTypeConfig,
  allMappingRows: MappingRow[] = tableRows
): FieldValidationSql {
  const knownFields = buildKnownFields(tableRows, allMappingRows);
  const classification = classifyTransformation(row.transformation, knownFields);

  // Two separate, independently-runnable queries rather than one correlated JOIN -- the tester
  // runs each against its own side and compares the result sets by key, matching the same
  // source-query/target-query pattern already used for row-count reconciliation.
  if (classification.expression) {
    const qualifiedExpr = qualifyFieldReferences(classification.expression, knownFields, 's');
    const sql = buildSourceTargetQueries(row, tableRows, typeConfig, qualifiedExpr);
    return { sql, isManualReview: false, classification };
  }

  const sourceQualified = resolveSourceReference(typeConfig, tableRows, row.sourceSchema, row.sourceTable);
  const targetQualified = resolveTargetReference(typeConfig, row.targetSchema, row.targetTable);

  const sourceSql = [
    `-- SOURCE query (reference only -- the transformation below could not be auto-translated)`,
    `-- Raw transformation rule for ${row.targetField}: "${row.transformation}"`,
    `SELECT * FROM ${sourceQualified} s LIMIT 10;`,
  ].join('\n');

  const targetSql = [
    `-- TARGET query`,
    `-- MANUAL REVIEW REQUIRED: translate the rule above into a comparison against ${quoteColumn(row.targetField)} below.`,
    `SELECT * FROM ${targetQualified} t LIMIT 10;`,
  ].join('\n');

  const sql = `${sourceSql}\n\n${targetSql}`;

  return { sql, isManualReview: true, classification };
}
