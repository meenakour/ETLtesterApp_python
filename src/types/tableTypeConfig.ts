import type { FileFormat } from '@/lib/fileFormat';

export type SourceKind = 'table' | 'file';
export type TargetKind = 'table' | 'file' | 'dashboard';

/**
 * Per-target-table source/target shape, selected by the user in the Preview step. Defaults to
 * the normal table-to-table (L2) shape so existing mapping docs behave exactly as before unless
 * the user explicitly opts a table into the L1 (file source) or L3 (dashboard target) shape.
 */
export interface TableTypeConfig {
  sourceKind: SourceKind;
  targetKind: TargetKind;
  sourceFileFormatOverride?: FileFormat;
  sourceFilePathOverride?: string;
  targetFileFormatOverride?: FileFormat;
  targetFilePathOverride?: string;
  dashboardName?: string;
  kpiName?: string;
}

export const DEFAULT_TABLE_TYPE_CONFIG: TableTypeConfig = {
  sourceKind: 'table',
  targetKind: 'table',
};

export function getTableTypeConfig(
  configs: Record<string, TableTypeConfig>,
  targetTable: string
): TableTypeConfig {
  return configs[targetTable] ?? DEFAULT_TABLE_TYPE_CONFIG;
}
