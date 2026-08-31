import type { MappingRow, JoinFilterRow, SheetData } from '@/types/mapping';
import type { DetectedColumn, MappingFieldKey } from '@/types/columnMapping';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';
import { groupMappingRowsByTargetTable } from '@/lib/excel/associateJoins';
import { levenshtein, normalizeHeader } from '@/lib/fuzzyMatch';

export type MappingIssueSeverity = 'warning' | 'info';

export type MappingIssueCode =
  | 'MISSING_TABLE_NAME'
  | 'DROPPED_ROW'
  | 'DUPLICATE_TARGET_FIELD'
  | 'NO_PRIMARY_KEY'
  | 'POSSIBLE_TYPO_TABLE'
  | 'POSSIBLE_TYPO_FIELD'
  | 'UNKNOWN_JOIN_TABLE_REF';

export interface MappingIssue {
  id: string;
  code: MappingIssueCode;
  /** Advisory only -- this never gates test-case generation, only informs the user. See
   *  MappingIssuesList, which reads this purely for display grouping/styling. */
  severity: MappingIssueSeverity;
  message: string;
  sheetRowNumbers: number[];
}

// A name pair scoring at or above this (normalized Levenshtein similarity -- 1 minus edit
// distance over the longer name's length) is flagged as a likely typo of each other. Deliberately
// NOT using the blended headerAliasScore from fuzzyMatch.ts here: its containment bonus rewards
// prefix relationships, which scores a legitimately-different, related pair like "t_indv_cust" vs
// "t_indv_cust_mbr" (a table and its detail table -- a real, common, non-typo pattern) *higher*
// than actual single-character typos like "t_indv_cust" vs "t_indv_cst". Pure edit distance is
// the more honest signal for "did someone mistype this name": real single-character typos land at
// 0.82-0.93 here, while "t_indv_cust"/"t_indv_cust_mbr" lands at 0.73 and "orders"/"customers" at
// 0.33 -- both correctly excluded at this threshold.
const NAME_SIMILARITY_THRESHOLD = 0.8;
// Guards the pairwise comparison below from O(n^2) blowup on a pathologically wide mapping doc --
// real-world docs are far smaller than this, so skipping the pass above the cap (rather than
// hanging) is a safe trade-off.
const MAX_NAMES_TO_COMPARE = 200;

function getCellValue(record: Record<string, unknown>, header: string | null): string {
  if (!header) return '';
  return String(record[header] ?? '').trim();
}

function matchedHeaderFor(columns: DetectedColumn<MappingFieldKey>[], field: MappingFieldKey): string | null {
  return columns.find((c) => c.field === field)?.matchedHeader ?? null;
}

/** Finds near-duplicate pairs within a pool of distinct names -- the closest thing to a "spell
 *  check" available without a dictionary or live schema to check against. */
function findTypoPairs(names: Set<string>): [string, string][] {
  const list = [...names].filter(Boolean);
  if (list.length > MAX_NAMES_TO_COMPARE) return [];
  const pairs: [string, string][] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a === b) continue;
      const normA = normalizeHeader(a);
      const normB = normalizeHeader(b);
      const maxLen = Math.max(normA.length, normB.length) || 1;
      const score = 1 - levenshtein(normA, normB) / maxLen;
      if (score >= NAME_SIMILARITY_THRESHOLD) pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * Reviews a parsed mapping document for structural issues worth a human's attention -- missing
 * table names, rows that got silently dropped during parsing, duplicate mappings, tables with no
 * declared primary key, possible typos in table/field names, and join conditions that reference a
 * table the mapping sheet never documents. Every issue is advisory: nothing here gates test-case
 * generation (see the `severity` doc comment on MappingIssue), it only surfaces things worth a
 * second look before generating.
 */
export function reviewMapping(
  mappingRows: MappingRow[],
  joinFilterRows: JoinFilterRow[],
  mappingSheet: SheetData | null,
  mappingColumns: DetectedColumn<MappingFieldKey>[]
): MappingIssue[] {
  const issues: MappingIssue[] = [];

  // 1. Missing table name given a field name.
  for (const row of mappingRows) {
    if (row.sourceField && !row.sourceTable) {
      issues.push({
        id: `MISSING_TABLE_NAME-src-${row.sheetRowNumber}`,
        code: 'MISSING_TABLE_NAME',
        severity: 'warning',
        message: `Row ${row.sheetRowNumber}: source field "${row.sourceField}" has no Source Table.`,
        sheetRowNumbers: [row.sheetRowNumber],
      });
    }
    if (row.targetField && !row.targetTable) {
      issues.push({
        id: `MISSING_TABLE_NAME-tgt-${row.sheetRowNumber}`,
        code: 'MISSING_TABLE_NAME',
        severity: 'warning',
        message: `Row ${row.sheetRowNumber}: target field "${row.targetField}" has no Target Table.`,
        sheetRowNumbers: [row.sheetRowNumber],
      });
    }
  }

  // 2. Rows silently dropped during parsing (both Source Field and Target Field blank). Mirrors
  // buildMappingRows.ts's own drop predicate (`.filter(r => r.sourceField || r.targetField)`)
  // rather than calling it, since that function's return shape has no room for "this got dropped".
  if (mappingSheet) {
    const sourceHeader = matchedHeaderFor(mappingColumns, 'sourceField');
    const targetHeader = matchedHeaderFor(mappingColumns, 'targetField');
    mappingSheet.rows.forEach((raw, index) => {
      const sourceFieldRaw = getCellValue(raw, sourceHeader);
      const targetFieldRaw = getCellValue(raw, targetHeader);
      if (!sourceFieldRaw && !targetFieldRaw) {
        const sheetRowNumber = mappingSheet.headerRowIndex + index + 2;
        issues.push({
          id: `DROPPED_ROW-${sheetRowNumber}`,
          code: 'DROPPED_ROW',
          severity: 'warning',
          message: `Row ${sheetRowNumber} has neither a Source Field nor a Target Field value and was skipped.`,
          sheetRowNumbers: [sheetRowNumber],
        });
      }
    });
  }

  // 3. Duplicate target-field mappings within the same target table.
  const byTargetKey = new Map<string, MappingRow[]>();
  for (const row of mappingRows) {
    if (!row.targetField) continue;
    const key = `${normalizeTableName(row.targetTable)}::${row.targetField.toLowerCase()}`;
    const list = byTargetKey.get(key) ?? [];
    list.push(row);
    byTargetKey.set(key, list);
  }
  for (const rows of byTargetKey.values()) {
    if (rows.length <= 1) continue;
    const rowNumbers = rows.map((r) => r.sheetRowNumber);
    issues.push({
      id: `DUPLICATE_TARGET_FIELD-${rowNumbers.join('-')}`,
      code: 'DUPLICATE_TARGET_FIELD',
      severity: 'warning',
      message: `Target field ${rows[0].targetTable}.${rows[0].targetField} is mapped by ${rows.length} rows (rows ${rowNumbers.join(', ')}) — confirm this is intentional rather than a duplicate entry.`,
      sheetRowNumbers: rowNumbers,
    });
  }

  // 4. Target table with no primary key flagged -- informational only, PK is optional.
  for (const [targetTable, rows] of groupMappingRowsByTargetTable(mappingRows)) {
    if (rows.some((r) => r.isPrimaryKey)) continue;
    issues.push({
      id: `NO_PRIMARY_KEY-${targetTable}`,
      code: 'NO_PRIMARY_KEY',
      severity: 'info',
      message: `${targetTable} has no field flagged as a primary key. This is optional, but PK/uniqueness test cases are only generated for tables with at least one PK field.`,
      sheetRowNumbers: rows.map((r) => r.sheetRowNumber),
    });
  }

  // 5. Possible typo -- near-duplicate table names (source and target pools kept separate, since
  // comparing a source table to a target table isn't a typo signal), and near-duplicate field
  // names within the same target table.
  const sourceTableNames = new Set(mappingRows.map((r) => r.sourceTable).filter(Boolean));
  const targetTableNames = new Set(mappingRows.map((r) => r.targetTable).filter(Boolean));
  for (const [a, b] of [...findTypoPairs(sourceTableNames), ...findTypoPairs(targetTableNames)]) {
    const rowNumbers = mappingRows.filter((r) => r.sourceTable === a || r.sourceTable === b || r.targetTable === a || r.targetTable === b).map((r) => r.sheetRowNumber);
    issues.push({
      id: `POSSIBLE_TYPO_TABLE-${a}-${b}`,
      code: 'POSSIBLE_TYPO_TABLE',
      severity: 'info',
      message: `'${a}' and '${b}' are very similar table names — check whether one is a typo of the other.`,
      sheetRowNumbers: rowNumbers,
    });
  }
  for (const [targetTable, rows] of groupMappingRowsByTargetTable(mappingRows)) {
    const fieldNames = new Set(rows.map((r) => r.targetField).filter(Boolean));
    for (const [a, b] of findTypoPairs(fieldNames)) {
      const rowNumbers = rows.filter((r) => r.targetField === a || r.targetField === b).map((r) => r.sheetRowNumber);
      issues.push({
        id: `POSSIBLE_TYPO_FIELD-${targetTable}-${a}-${b}`,
        code: 'POSSIBLE_TYPO_FIELD',
        severity: 'info',
        message: `In ${targetTable}: '${a}' and '${b}' are very similar field names — check whether one is a typo of the other.`,
        sheetRowNumbers: rowNumbers,
      });
    }
  }

  // 6. Join/filter row referencing a table not documented anywhere in the mapping sheet. Reuses
  // the exact same normalizeTableName matching computeJoinScope/associateJoins.ts already use for
  // real query generation, so a flagged row is exactly one that would silently fail to attach to
  // any generated SQL -- not just a heuristic guess.
  const knownTables = new Set([
    ...mappingRows.map((r) => normalizeTableName(r.sourceTable)),
    ...mappingRows.map((r) => normalizeTableName(r.targetTable)),
  ]);
  for (const joinRow of joinFilterRows) {
    if (!joinRow.joinCondition && !joinRow.filterCondition) continue;
    const candidates = [joinRow.tableName, ...joinRow.tablesInvolved].map(normalizeTableName).filter(Boolean);
    if (candidates.length === 0) continue;
    const resolved = candidates.some((c) => knownTables.has(c));
    if (!resolved) {
      issues.push({
        id: `UNKNOWN_JOIN_TABLE_REF-${joinRow.sheetRowNumber}`,
        code: 'UNKNOWN_JOIN_TABLE_REF',
        severity: 'warning',
        message: `Row ${joinRow.sheetRowNumber} in the Joins & Filters sheet references '${joinRow.tableName}', which doesn't match any Source or Target table in the mapping sheet.`,
        sheetRowNumbers: [joinRow.sheetRowNumber],
      });
    }
  }

  return issues;
}
