export type TestCategory =
  | 'ROW_COUNT_RECONCILIATION'
  | 'SCHEMA_DATATYPE_VALIDATION'
  | 'PK_NULL_UNIQUENESS'
  | 'TRANSFORMATION_VALIDATION'
  | 'EDGE_CASE_DATATYPE'
  | 'DQ_CHECKS'
  | 'BUSINESS_RULE'
  | 'NEGATIVE_CALCULATION'
  | 'DASHBOARD_KPI_VALIDATION';

export const TEST_CATEGORIES: TestCategory[] = [
  'ROW_COUNT_RECONCILIATION',
  'SCHEMA_DATATYPE_VALIDATION',
  'PK_NULL_UNIQUENESS',
  'TRANSFORMATION_VALIDATION',
  'EDGE_CASE_DATATYPE',
  'DQ_CHECKS',
  'BUSINESS_RULE',
  'NEGATIVE_CALCULATION',
  'DASHBOARD_KPI_VALIDATION',
];

export const CATEGORY_LABELS: Record<TestCategory, string> = {
  ROW_COUNT_RECONCILIATION: 'Row Count Reconciliation',
  SCHEMA_DATATYPE_VALIDATION: 'Schema & Datatype Validation',
  PK_NULL_UNIQUENESS: 'PK / Null / Uniqueness',
  TRANSFORMATION_VALIDATION: 'Transformation & Value Validation',
  EDGE_CASE_DATATYPE: 'Datatype Boundary Validation',
  DQ_CHECKS: 'Data Quality Checks',
  BUSINESS_RULE: 'Business Rule Validation',
  NEGATIVE_CALCULATION: 'Negative Tests (%, Aggregation)',
  DASHBOARD_KPI_VALIDATION: 'Dashboard KPI Validation',
};

export const CATEGORY_DESCRIPTIONS: Record<TestCategory, string> = {
  ROW_COUNT_RECONCILIATION:
    'Confirms source and target row counts match, respecting join and filter conditions.',
  SCHEMA_DATATYPE_VALIDATION:
    'Confirms target column datatypes, lengths and nullability match the mapping specification.',
  PK_NULL_UNIQUENESS:
    'Checks primary key uniqueness and validates NOT NULL constraints on flagged fields (including Critical Data Elements when no PK is declared).',
  TRANSFORMATION_VALIDATION:
    'Validates that per-field transformation logic produces the expected target value.',
  EDGE_CASE_DATATYPE:
    'Datatype-driven boundary checks: whitespace, overflow, negative values, invalid dates, etc.',
  DQ_CHECKS:
    'Field-name heuristics (email/phone/id patterns), duplicate detection, referential integrity, and CDE safety-net uniqueness checks.',
  BUSINESS_RULE:
    'Parses free-text transformation rules into validation SQL, or flags for manual review.',
  NEGATIVE_CALCULATION:
    'Division-by-zero, out-of-range percentage/ratio, NULL-handling in aggregations, and join fan-out risks.',
  DASHBOARD_KPI_VALIDATION:
    'Computes the underlying metric via SQL and pairs it with a manual comparison against the dashboard KPI it feeds (L3).',
};

export const CATEGORY_PREFIX: Record<TestCategory, string> = {
  ROW_COUNT_RECONCILIATION: 'RC',
  SCHEMA_DATATYPE_VALIDATION: 'SV',
  PK_NULL_UNIQUENESS: 'PK',
  TRANSFORMATION_VALIDATION: 'TV',
  EDGE_CASE_DATATYPE: 'EC',
  DQ_CHECKS: 'DQ',
  BUSINESS_RULE: 'BR',
  NEGATIVE_CALCULATION: 'NC',
  DASHBOARD_KPI_VALIDATION: 'DK',
};

export type Priority = 'P1' | 'P2' | 'P3';

export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'P1 - Critical',
  P2: 'P2 - Medium',
  P3: 'P3 - Low',
};

/** Default priority for each category; individual generators may override on a per-case basis
 *  (e.g. a referential-integrity DQ check or a manual-review business rule is bumped to P1). */
export const CATEGORY_DEFAULT_PRIORITY: Record<TestCategory, Priority> = {
  ROW_COUNT_RECONCILIATION: 'P1',
  SCHEMA_DATATYPE_VALIDATION: 'P1',
  PK_NULL_UNIQUENESS: 'P1',
  TRANSFORMATION_VALIDATION: 'P2',
  EDGE_CASE_DATATYPE: 'P3',
  DQ_CHECKS: 'P2',
  BUSINESS_RULE: 'P2',
  NEGATIVE_CALCULATION: 'P2',
  DASHBOARD_KPI_VALIDATION: 'P1',
};

export interface TestCase {
  id: string;
  name: string;
  category: TestCategory;
  priority: Priority;
  description: string;
  steps: string[];
  expectedResult: string;
  sql: string;
  targetTable: string;
  sourceMappingRowIds: string[];
  isManualReview?: boolean;
  /** Flags a test case that targets a Critical Data Element (identified by name heuristics),
   *  which matters most when the mapping doesn't declare a formal primary key. */
  isCde?: boolean;
  /** Flags a test case whose expected result requires manually comparing a computed SQL value
   *  against a BI dashboard KPI (L3) rather than another queryable table. */
  isDashboardComparison?: boolean;
  /** Set when a Manual Review transformation/business rule was subsequently translated into SQL
   *  by the optional AI Assist feature rather than the deterministic classifier -- still worth a
   *  tester's extra scrutiny before trusting it, so it's flagged distinctly rather than silently
   *  presented the same as a fully deterministic match. */
  isAiSuggested?: boolean;
}
