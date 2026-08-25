export const CDE_TOOLTIP =
  'Critical Data Element — a field flagged by name heuristics (financial, status, or identifier-style) as high-importance, especially relevant when no primary key is declared for this table.';

export const MANUAL_REVIEW_TOOLTIP =
  'The transformation/business rule text could not be automatically translated into SQL — a tester needs to review and complete this test case manually.';

export const DASHBOARD_COMPARISON_TOOLTIP =
  'This test computes a metric via SQL, but the target is a BI dashboard KPI, not a queryable table — a tester must manually compare the computed value to the dashboard.';

export const AI_SUGGESTED_TOOLTIP =
  'This SQL was translated from the transformation rule by the optional AI Assist feature after the deterministic classifier could not confidently parse it — review it carefully before trusting it, the same as any AI-generated suggestion.';
