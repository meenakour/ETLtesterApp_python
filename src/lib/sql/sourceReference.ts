import { qualifiedTable } from '@/lib/sql/identifierQuoting';
import { inferFileFormat, buildFilePath, type FileFormat } from '@/lib/fileFormat';
import type { TableTypeConfig } from '@/types/tableTypeConfig';
import type { MappingRow } from '@/types/mapping';

/** Low-level: a file.`path` reference when file-backed, otherwise the normal quoted table reference. */
export function resolveReference(
  kind: 'table' | 'file',
  schema: string | undefined,
  table: string,
  fileFormat: FileFormat | undefined,
  filePath: string | undefined
): string {
  if (kind === 'file' && filePath) {
    return `${fileFormat ?? 'csv'}.\`${filePath}\``;
  }
  return qualifiedTable(schema, table);
}

/**
 * Resolves the SOURCE-side FROM reference for a table group: auto-detects the file path/format
 * from the group's own rows' `sourceFileLocation`/`sourceFileName` columns when the mapping doc
 * has them, falling back to the per-table manual override collected in the Preview step.
 */
export function resolveSourceReference(
  config: TableTypeConfig,
  rows: MappingRow[],
  sourceSchema: string | undefined,
  sourceTable: string
): string {
  if (config.sourceKind !== 'file') {
    return qualifiedTable(sourceSchema, sourceTable);
  }

  const rowWithFile = rows.find((r) => r.sourceFileLocation || r.sourceFileName);
  const detectedPath = rowWithFile
    ? buildFilePath(rowWithFile.sourceFileLocation, rowWithFile.sourceFileName)
    : '';
  const filePath = detectedPath || config.sourceFilePathOverride || '';

  const detectedFormat = rowWithFile?.sourceFileName ? inferFileFormat(rowWithFile.sourceFileName) : null;
  const fileFormat = detectedFormat ?? config.sourceFileFormatOverride ?? 'csv';

  return resolveReference('file', sourceSchema, sourceTable, fileFormat, filePath);
}

/** Resolves the TARGET-side FROM reference. Only called for targetKind 'table'/'file' -- callers skip 'dashboard' targets before reaching this. */
export function resolveTargetReference(
  config: TableTypeConfig,
  targetSchema: string | undefined,
  targetTable: string
): string {
  if (config.targetKind !== 'file') {
    return qualifiedTable(targetSchema, targetTable);
  }
  const fileFormat = config.targetFileFormatOverride ?? 'csv';
  return resolveReference('file', targetSchema, targetTable, fileFormat, config.targetFilePathOverride || '');
}
