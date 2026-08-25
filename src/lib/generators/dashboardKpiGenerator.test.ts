import { describe, expect, it } from 'vitest';
import { generateDashboardKpiTests } from '@/lib/generators/dashboardKpiGenerator';
import { makeMappingRow, buildContext } from '@/lib/generators/testHelpers';
import { DEFAULT_TABLE_TYPE_CONFIG } from '@/types/tableTypeConfig';

describe('generateDashboardKpiTests', () => {
  it('does nothing for a normal table-target group', () => {
    const rows = [makeMappingRow({ targetTable: 'orders', sourceField: 'amount', sourceTable: 'orders_raw' })];
    expect(generateDashboardKpiTests(buildContext(rows))).toEqual([]);
  });

  it('computes the KPI via SQL and frames the result as a dashboard comparison', () => {
    const rows = [
      makeMappingRow({
        targetTable: 'revenue_kpi',
        targetField: 'total_revenue',
        sourceTable: 'orders',
        sourceField: 'amount',
        transformation: 'SUM(amount)',
      }),
    ];
    const config = {
      ...DEFAULT_TABLE_TYPE_CONFIG,
      targetKind: 'dashboard' as const,
      dashboardName: 'Sales Overview',
      kpiName: 'Total Revenue',
    };
    const testCases = generateDashboardKpiTests(buildContext(rows, [], { revenue_kpi: config }));

    expect(testCases).toHaveLength(1);
    const tc = testCases[0];
    expect(tc.category).toBe('DASHBOARD_KPI_VALIDATION');
    expect(tc.priority).toBe('P1');
    expect(tc.isDashboardComparison).toBe(true);
    expect(tc.sql).toContain('SUM(');
    expect(tc.sql).toContain('amount');
    expect(tc.sql).not.toContain('NOTE'); // regression: SUM must classify properly, not fall back to the manual-note placeholder
    expect(tc.name).toContain('Total Revenue');
    expect(tc.name).toContain('Sales Overview');
    expect(tc.expectedResult).toContain('Total Revenue');
    expect(tc.expectedResult).toContain('Sales Overview');
  });

  it('falls back to the raw source field with a note when the transformation cannot be auto-translated', () => {
    const rows = [
      makeMappingRow({
        targetTable: 'engagement_kpi',
        targetField: 'active_users',
        sourceTable: 'sessions',
        sourceField: 'user_id',
        transformation: "per business team's custom rule engine, see wiki",
      }),
    ];
    const config = { ...DEFAULT_TABLE_TYPE_CONFIG, targetKind: 'dashboard' as const };
    const testCases = generateDashboardKpiTests(buildContext(rows, [], { engagement_kpi: config }));

    expect(testCases).toHaveLength(1);
    expect(testCases[0].sql).toContain('NOTE');
    expect(testCases[0].sql).toContain('user_id');
  });

  it('resolves a file source when sourceKind is file', () => {
    const rows = [
      makeMappingRow({
        targetTable: 'revenue_kpi',
        targetField: 'total_revenue',
        sourceTable: 'orders',
        sourceField: 'amount',
        sourceFileLocation: '/mnt/landing',
        sourceFileName: 'orders.csv',
        transformation: 'SUM(amount)',
      }),
    ];
    const config = {
      ...DEFAULT_TABLE_TYPE_CONFIG,
      sourceKind: 'file' as const,
      targetKind: 'dashboard' as const,
    };
    const testCases = generateDashboardKpiTests(buildContext(rows, [], { revenue_kpi: config }));
    expect(testCases[0].sql).toContain('csv.`/mnt/landing/orders.csv`');
  });
});
