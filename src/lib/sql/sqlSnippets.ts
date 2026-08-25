import type { JoinFilterRow } from '@/types/mapping';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';
import { quoteColumn } from '@/lib/sql/identifierQuoting';

/**
 * A join row is only relevant to a given FROM table if that table is actually one of the two
 * tables it involves -- e.g. a join documented for a different table that merely shares a join
 * partner has nothing to do with this FROM clause. Shared by `buildJoinClauseLines` (so it never
 * fabricates a join to the wrong table) and by callers that need to filter a join list down to
 * "the ones that actually got attached" before building a matching WHERE clause -- attaching every
 * candidate join's filter condition regardless of whether the join itself was relevant would
 * reference tables/aliases that never appear in the FROM clause at all.
 */
export function filterJoinsRelevantTo(currentTable: string, joinRows: JoinFilterRow[]): JoinFilterRow[] {
  const normalizedCurrent = normalizeTableName(currentTable);
  return joinRows.filter((row) => row.tablesInvolved.some((t) => normalizeTableName(t) === normalizedCurrent));
}

/** Builds `<JOIN TYPE> JOIN other_table ON <condition>` lines for the tables joined to `currentTable`. */
export function buildJoinClauseLines(currentTable: string, joinRows: JoinFilterRow[]): string[] {
  const normalizedCurrent = normalizeTableName(currentTable);
  const lines: string[] = [];

  for (const row of filterJoinsRelevantTo(currentTable, joinRows)) {
    if (!row.joinCondition) continue;
    const otherTable = row.tablesInvolved.find((t) => normalizeTableName(t) !== normalizedCurrent);
    const joinType = (row.joinType || 'INNER').toUpperCase();
    const joinTypeNormalized = joinType.includes('JOIN') ? joinType : `${joinType} JOIN`;
    if (otherTable) {
      lines.push(`${joinTypeNormalized} ${quoteColumn(otherTable)} ON ${row.joinCondition}`);
    } else {
      lines.push(`-- ${joinTypeNormalized} condition (verify table alias): ${row.joinCondition}`);
    }
  }
  return lines;
}

export function buildWhereClauseLines(joinRows: JoinFilterRow[]): string[] {
  return joinRows.filter((r) => r.filterCondition).map((r) => `(${r.filterCondition})`);
}

export function buildFromClause(qualifiedTable: string, joinRows: JoinFilterRow[]): string {
  const parts = [`FROM ${qualifiedTable}`, ...buildJoinClauseLines(qualifiedTable, joinRows)];
  return parts.join('\n');
}

export function combineWhere(whereParts: string[]): string {
  if (whereParts.length === 0) return '';
  return `WHERE ${whereParts.join('\n  AND ')}`;
}
