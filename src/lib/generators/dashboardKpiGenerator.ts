import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { resolveSourceReference } from '@/lib/sql/sourceReference';
import { quoteColumn } from '@/lib/sql/identifierQuoting';
import { classifyTransformation, qualifyFieldReferences } from '@/lib/generators/businessRuleHeuristics';

/**
 * L3 dashboard-KPI validation: there's no queryable target (a dashboard tile isn't a table), so
 * every other generator skips these table groups entirely. This one instead computes the metric
 * from the source data via SQL and pairs it with an explicit "go compare this to the dashboard"
 * step -- inherently a semi-manual test, flagged with isDashboardComparison rather than guessed at.
 */
export function generateDashboardKpiTests(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind !== 'dashboard') continue;

    const sourceTable = rows.find((r) => r.sourceTable)?.sourceTable ?? '';
    const sourceSchema = rows.find((r) => r.sourceSchema)?.sourceSchema;
    const sourceQualified = resolveSourceReference(typeConfig, rows, sourceSchema, sourceTable);
    // See transformationSql.ts's buildFieldValidationSql for why this includes more than just
    // this table's own source fields: a KPI formula commonly references a sibling source column
    // mapped elsewhere in the doc, not only the row's own declared Source Field.
    const knownFields = [...rows.map((r) => r.sourceField), ...ctx.allMappingRows.map((r) => r.sourceField)].filter(
      Boolean
    );

    const kpiName = typeConfig.kpiName || targetTable;
    const dashboardName = typeConfig.dashboardName || '(dashboard name not set — configure it in Preview)';

    const selectColumns: string[] = [];
    const notes: string[] = [];

    for (const row of rows) {
      if (!row.sourceField) continue;
      const alias = row.targetField || row.sourceField;
      const classification = classifyTransformation(row.transformation, knownFields, { allowAggregates: true });

      if (classification.expression) {
        const qualifiedExpr = qualifyFieldReferences(classification.expression, knownFields, 's');
        selectColumns.push(`${qualifiedExpr} AS ${quoteColumn(alias)}`);
      } else {
        // Not auto-translatable -- still emit a usable (if approximate) query rather than nothing,
        // but flag it clearly so the tester knows this column needs a manual look.
        selectColumns.push(`s.${quoteColumn(row.sourceField)} AS ${quoteColumn(alias)}`);
        notes.push(`-- NOTE: transformation for ${alias} ("${row.transformation}") could not be auto-translated; verify this column manually.`);
      }
    }

    if (selectColumns.length === 0) continue;

    const sql = [
      ...notes,
      `SELECT ${selectColumns.join(', ')}`,
      `FROM ${sourceQualified} s;`,
    ].join('\n');

    testCases.push({
      id: nextDraftId(),
      name: `Dashboard KPI Validation: ${kpiName} (${dashboardName})`,
      category: 'DASHBOARD_KPI_VALIDATION',
      priority: 'P1',
      isDashboardComparison: true,
      description: `Computes ${kpiName} from the underlying source data; this is the metric that feeds the '${kpiName}' tile on the '${dashboardName}' dashboard.`,
      steps: [
        'Run the query above.',
        `Open the '${dashboardName}' dashboard and locate the '${kpiName}' tile.`,
        'Compare the query result to the dashboard value, allowing for rounding/currency formatting differences.',
      ],
      expectedResult: `The computed value matches the '${kpiName}' value shown on the '${dashboardName}' dashboard (within rounding tolerance).`,
      sql,
      targetTable,
      sourceMappingRowIds: rows.map((r) => r.id),
    });
  }

  return testCases;
}
