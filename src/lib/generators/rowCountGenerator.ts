import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import type { MappingRow, JoinFilterRow } from '@/types/mapping';
import { primaryJoinsForTable } from '@/lib/excel/associateJoins';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';
import { buildFromClause, buildWhereClauseLines, combineWhere, filterJoinsRelevantTo } from '@/lib/sql/sqlSnippets';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { resolveSourceReference, resolveTargetReference } from '@/lib/sql/sourceReference';

function dedupeJoinRows(rows: JoinFilterRow[]): JoinFilterRow[] {
  return [...new Set(rows)];
}

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
    const relevantJoins = isFileSource
      ? []
      : dedupeJoinRows([
          ...primaryJoinsForTable(ctx.joinIndex, sourceTable),
          ...primaryJoinsForTable(ctx.joinIndex, targetTable),
        ]);

    const sourceQualified = resolveSourceReference(typeConfig, srcRows, sourceSchema, sourceTable);
    const targetQualified = resolveTargetReference(typeConfig, targetSchema, targetTable);

    const fromClause = buildFromClause(sourceQualified, relevantJoins);
    // Only carry a join's filter condition into the WHERE clause when that join actually got
    // attached to the FROM clause above (i.e. it's genuinely about `sourceTable`) -- otherwise
    // the query would reference a table/alias that never appears in the FROM at all. This can
    // happen when the joins sheet documents conditions against the target-layer table name while
    // the primary source table uses a different physical name (e.g. a "_raw" landing suffix); in
    // that case the reconciliation still runs, just without those join filters applied.
    const attachedJoins = filterJoinsRelevantTo(sourceTable, relevantJoins);
    const whereClause = combineWhere(buildWhereClauseLines(attachedJoins));

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
      description: `Confirms the number of rows loaded into ${targetTable} matches the number of eligible rows in ${sourceLabel}${attachedJoins.length ? ', honoring any documented join/filter conditions' : ''}.`,
      steps: [
        `Run the source count query against ${isFileSource ? 'the source file' : `\`${sourceTable}\``}${attachedJoins.length ? ' with the associated joins/filters applied' : ''}.`,
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
