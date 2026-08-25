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

/**
 * Some mapping docs write their Join/Filter Condition cells as if the leading SQL keyword were
 * already part of the text (e.g. "on srctb1.id = srctb2.id", "where amount > 0"), since that's
 * literally what a tester would type after ON/WHERE. Stripping a redundant leading keyword here
 * (rather than assuming the cell is a bare boolean expression) avoids emitting invalid doubled
 * SQL like "ON on srctb1.id = ...", which previously produced syntactically broken join clauses.
 */
export function stripRedundantLeadingKeyword(condition: string, keyword: 'on' | 'where'): string {
  return condition.replace(new RegExp(`^\\s*${keyword}\\s+`, 'i'), '');
}

export interface JoinScope {
  /** `<JOIN TYPE> JOIN other_table ON <condition>` lines, in attachment order. */
  lines: string[];
  /** Every table (normalized) now covered by `currentTable` plus these join lines -- i.e. not just
   *  `currentTable` itself, but every table reachable by following joins transitively from it. */
  tables: Set<string>;
}

/**
 * Expands outward from `currentTable`, attaching every join reachable from it -- directly, or
 * transitively through another join already brought into scope (e.g. A joined to B, B joined to
 * C: querying FROM A should still pick up the B-C join once B is in scope, not just the direct
 * A-B one). Runs to a fixed point: repeatedly scans for a join with exactly one side already in
 * scope, attaches it, and expands scope to include its other side, until no more can be attached.
 * Returns the resulting table set alongside the join lines so callers can also determine which
 * *filter* conditions legitimately apply to this query -- a filter documented against any table
 * that ends up in scope is just as relevant as one documented against `currentTable` itself,
 * since it constrains data that's actually part of the same joined result set.
 */
export function computeJoinScope(currentTable: string, joinRows: JoinFilterRow[]): JoinScope {
  const tables = new Set<string>([normalizeTableName(currentTable)]);
  let remaining = joinRows.filter((r) => r.joinCondition);
  const lines: string[] = [];

  let progressed = true;
  while (progressed) {
    progressed = false;
    const stillRemaining: JoinFilterRow[] = [];
    for (const row of remaining) {
      const normalizedTables = row.tablesInvolved.map(normalizeTableName);
      const reachable = normalizedTables.some((t) => tables.has(t));
      const otherTable = row.tablesInvolved.find((t) => !tables.has(normalizeTableName(t)));
      if (reachable && otherTable) {
        const joinType = (row.joinType || 'INNER').toUpperCase();
        const joinTypeNormalized = joinType.includes('JOIN') ? joinType : `${joinType} JOIN`;
        const condition = stripRedundantLeadingKeyword(row.joinCondition!, 'on');
        lines.push(`${joinTypeNormalized} ${quoteColumn(otherTable)} ON ${condition}`);
        tables.add(normalizeTableName(otherTable));
        progressed = true;
      } else {
        stillRemaining.push(row);
      }
    }
    remaining = stillRemaining;
  }

  return { lines, tables };
}

/** Builds `<JOIN TYPE> JOIN other_table ON <condition>` lines for every table transitively joined to `currentTable`. */
export function buildJoinClauseLines(currentTable: string, joinRows: JoinFilterRow[]): string[] {
  return computeJoinScope(currentTable, joinRows).lines;
}

export function buildWhereClauseLines(joinRows: JoinFilterRow[]): string[] {
  return joinRows
    .filter((r) => r.filterCondition)
    .map((r) => `(${stripRedundantLeadingKeyword(r.filterCondition!, 'where')})`);
}

/** Filter conditions documented against any table that ends up in `scope` (see computeJoinScope) -- not just `currentTable` itself. */
export function filterConditionsInScope(joinRows: JoinFilterRow[], scope: Set<string>): JoinFilterRow[] {
  return joinRows.filter((r) => r.filterCondition && r.tablesInvolved.some((t) => scope.has(normalizeTableName(t))));
}

export function buildFromClause(qualifiedTable: string, joinRows: JoinFilterRow[]): string {
  const parts = [`FROM ${qualifiedTable}`, ...buildJoinClauseLines(qualifiedTable, joinRows)];
  return parts.join('\n');
}

export function combineWhere(whereParts: string[]): string {
  if (whereParts.length === 0) return '';
  return `WHERE ${whereParts.join('\n  AND ')}`;
}
