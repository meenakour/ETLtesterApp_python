export interface MappingRow {
  id: string;
  sourceField: string;
  sourceTable: string;
  sourceSchema: string;
  transformation: string;
  targetField: string;
  targetTable: string;
  targetSchema: string;
  targetDatatype: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  /** L1-style file sources: populated only when the mapping doc has recognizable file-location/file-name columns. */
  sourceFileLocation?: string;
  sourceFileName?: string;
  rawRow: Record<string, unknown>;
  sheetRowNumber: number;
}

export interface JoinFilterRow {
  id: string;
  tableName: string;
  schemaName?: string;
  joinType?: string;
  joinCondition?: string;
  tablesInvolved: string[];
  filterCondition?: string;
  rawRow: Record<string, unknown>;
  sheetRowNumber: number;
}

export interface SheetData {
  sheetName: string;
  headers: string[];
  headerRowIndex: number;
  rows: Record<string, unknown>[];
}
