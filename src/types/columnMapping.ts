export type MappingFieldKey =
  | 'sourceField'
  | 'sourceTable'
  | 'sourceSchema'
  | 'transformation'
  | 'targetField'
  | 'targetTable'
  | 'targetSchema'
  | 'targetDatatype'
  | 'primaryKeyFlag'
  | 'nullableFlag'
  | 'sourceFileLocation'
  | 'sourceFileName';

export type JoinFieldKey =
  | 'tableName'
  | 'schemaName'
  | 'joinType'
  | 'joinCondition'
  | 'tablesInvolved'
  | 'filterCondition';

export const REQUIRED_MAPPING_FIELDS: MappingFieldKey[] = ['sourceField', 'targetField', 'targetTable'];
export const REQUIRED_JOIN_FIELDS: JoinFieldKey[] = ['tableName'];

export const MAPPING_FIELD_LABELS: Record<MappingFieldKey, string> = {
  sourceField: 'Source Field',
  sourceTable: 'Source Table',
  sourceSchema: 'Source Schema',
  transformation: 'Transformation',
  targetField: 'Target Field',
  targetTable: 'Target Table',
  targetSchema: 'Target Schema',
  targetDatatype: 'Target Datatype',
  primaryKeyFlag: 'Primary Key Flag',
  nullableFlag: 'Nullable Flag',
  sourceFileLocation: 'Source File Location',
  sourceFileName: 'Source File Name',
};

export const JOIN_FIELD_LABELS: Record<JoinFieldKey, string> = {
  tableName: 'Table Name',
  schemaName: 'Schema Name',
  joinType: 'Join Type',
  joinCondition: 'Join Condition',
  tablesInvolved: 'Tables Involved',
  filterCondition: 'Filter Condition',
};

export interface DetectedColumn<K extends string> {
  field: K;
  matchedHeader: string | null;
  confidence: number;
  inverted?: boolean;
}

export type ColumnMappingResult<K extends string> = DetectedColumn<K>[];
