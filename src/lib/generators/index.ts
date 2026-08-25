import type { TestCategory, TestCase } from '@/types/testCase';
import type { GeneratorContext, GeneratorFn } from '@/lib/generators/types';
import { assignSequentialIds } from '@/lib/testCaseId';

import { generateRowCountTests } from '@/lib/generators/rowCountGenerator';
import { generateSchemaValidationTests } from '@/lib/generators/schemaValidationGenerator';
import { generatePkNullUniquenessTests } from '@/lib/generators/pkNullUniquenessGenerator';
import { generateTransformationValidationTests } from '@/lib/generators/transformationValidationGenerator';
import { generateEdgeCaseTests } from '@/lib/generators/edgeCaseGenerator';
import { generateDqChecks } from '@/lib/generators/dqChecksGenerator';
import { generateBusinessRuleTests } from '@/lib/generators/businessRuleGenerator';
import { generateNegativeCalculationTests } from '@/lib/generators/negativeCalculationGenerator';
import { generateDashboardKpiTests } from '@/lib/generators/dashboardKpiGenerator';

export type { GeneratorContext } from '@/lib/generators/types';

export const GENERATORS: Record<TestCategory, GeneratorFn> = {
  ROW_COUNT_RECONCILIATION: generateRowCountTests,
  SCHEMA_DATATYPE_VALIDATION: generateSchemaValidationTests,
  PK_NULL_UNIQUENESS: generatePkNullUniquenessTests,
  TRANSFORMATION_VALIDATION: generateTransformationValidationTests,
  EDGE_CASE_DATATYPE: generateEdgeCaseTests,
  DQ_CHECKS: generateDqChecks,
  BUSINESS_RULE: generateBusinessRuleTests,
  NEGATIVE_CALCULATION: generateNegativeCalculationTests,
  DASHBOARD_KPI_VALIDATION: generateDashboardKpiTests,
};

export function runGenerators(selected: TestCategory[], ctx: GeneratorContext): TestCase[] {
  const generated = selected.flatMap((category) => GENERATORS[category](ctx));
  return assignSequentialIds(generated);
}
