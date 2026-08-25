import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import type { MappingRow } from '@/types/mapping';
import { allJoinRows } from '@/lib/excel/associateJoins';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';
import { buildWhereClauseLines, combineWhere, computeJoinScope, filterConditionsInScope } from '@/lib/sql/sqlSnippets';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { resolveSourceReference, resolveTargetReference } from '@/lib/sql/sourceReference';

/**
 * Picks the single "driving" source table for a target group's row-count check -- the one whose
 * rows account for most of the mapped fields. A target table is very commonly denormalized from
 * several *joined* lookup tables (a customer name pulled in via a customer_id join, a product name
 * via a product_id join, etc.) in addition to its one true 1:1 source. Those joined lookup tables
 * are not independent pipelines with their own row-count relationship to the target -- comparing
 * a lookup table's row count against the target's is either meaningless or actively misleading, and
 * previously produced one spurious "Row Count Reconciliation" test case per joined table (as many as
 * there were joins). Only the plurality source table gets a row-count check; every other table a
 * field happens to come from is still covered via referential-integrity checks in the DQ category.
 */
function pickPrimarySourceTable(rows: MappingRow[], targetTable: string): { sourceTable: string; rows: MappingRow[] } | null {
  const groups = new Map<string, MappingRow[]>();
  for (const row of rows) {
    if (!row.sourceTable) continue;
    const list = groups.get(row.sourceTable) ?? [];
    list.push(row);
    groups.set(row.sourceTable, list);
  }
  if (groups.size === 0) return null;

  const normalizedTarget = normalizeTableName(targetTable);
  let best: { sourceTable: string; rows: MappingRow[] } | null = null;
  for (const [sourceTable, srcRows] of groups) {
    if (!best) {
      best = { sourceTable, rows: srcRows };
      continue;
    }
    if (srcRows.length > best.rows.length) {
      best = { sourceTable, rows: srcRows };
    } else if (srcRows.length === best.rows.length && normalizeTableName(sourceTable) === normalizedTarget) {
      // Tie-break toward the source table that shares the target's own name -- the common
      // same-name-across-layers convention (e.g. "orders_raw"/"orders" or "orders"/"orders").
      best = { sourceTable, rows: srcRows };
    }
  }
  return best;
}

export function generateRowCountTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind === 'dashboard') continue; // row count doesn't apply to a KPI

    const targetSchema = rows.find((r) => r.targetSchema)?.targetSchema;

    const primary = pickPrimarySourceTable(rows, targetTable);
    if (!primary) continue;
    const { sourceTable, rows: srcRows } = primary;

    const sourceSchema = srcRows.find((r) => r.sourceSchema)?.sourceSchema;
    const isFileSource = typeConfig.sourceKind === 'file';
    // The full workbook's join/filter rows, not just ones primarily owned by `sourceTable` or
    // `targetTable` -- computeJoinScope below needs the wider candidate pool to discover a join
    // that's only reachable transitively (e.g. sourceTable joined to B, and B separately joined to
    // C via a row owned by B, not sourceTable). It safely ignores anything not actually connected.
    const relevantJoins = isFileSource ? [] : allJoinRows(ctx.joinIndex);

    const sourceQualified = resolveSourceReference(typeConfig, srcRows, sourceSchema, sourceTable);
    const targetQualified = resolveTargetReference(typeConfig, targetSchema, targetTable);

    // Expand outward from `sourceTable` to every table transitively reachable through the
    // documented joins (A joined to B, B joined to C, ...), not just tables directly joined to
    // it -- otherwise a filter or join tied to a transitively-joined table (e.g. one two hops
    // away) would be silently dropped even though its table is genuinely part of this query, and
    // the reconciliation would compare against the wrong set of "eligible" rows.
    const { lines: joinLines, tables: scopeTables } = computeJoinScope(sourceTable, relevantJoins);
    const fromClause = [`FROM ${sourceQualified}`, ...joinLines].join('\n');
    const scopedFilters = filterConditionsInScope(relevantJoins, scopeTables);
    const whereClause = combineWhere(buildWhereClauseLines(scopedFilters));
    const hasJoinsOrFilters = joinLines.length > 0 || scopedFilters.length > 0;

    const sourceSql = [`SELECT COUNT(*) AS source_row_count`, fromClause, whereClause]
      .filter(Boolean)
      .join('\n');
    const targetSql = `SELECT COUNT(*) AS target_row_count\nFROM ${targetQualified};`;

    const sql = `-- Source row count\n${sourceSql};\n\n-- Target row count\n${targetSql}`;

    const sourceLabel = isFileSource ? `${sourceTable} (file)` : sourceTable;

    testCases.push({
      id: nextDraftId(),
      name: `Row Count Reconciliation: ${sourceLabel} -> ${targetTable}`,
      category: 'ROW_COUNT_RECONCILIATION',
      priority: 'P1',
      description: `Confirms the number of rows loaded into ${targetTable} matches the number of eligible rows in ${sourceLabel}${hasJoinsOrFilters ? ', honoring any documented join/filter conditions' : ''}.`,
      steps: [
        `Run the source count query against ${isFileSource ? 'the source file' : `\`${sourceTable}\``}${hasJoinsOrFilters ? ' with the associated joins/filters applied' : ''}.`,
        `Run the target count query against \`${targetTable}\`.`,
        'Compare source_row_count to target_row_count.',
      ],
      expectedResult:
        'source_row_count equals target_row_count (or matches a documented, intentional delta if filters are expected to exclude rows).',
      sql,
      targetTable,
      sourceMappingRowIds: srcRows.map((r) => r.id),
    });
  }

  return testCases;
}
