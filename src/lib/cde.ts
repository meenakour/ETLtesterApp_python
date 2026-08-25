/**
 * Critical Data Element (CDE) heuristics — field-name-based detection of fields that data
 * governance/testing teams would flag as high-importance regardless of whether the mapping
 * document declared a formal primary key. Used to fill the coverage gap that appears when a
 * table has no PK: identifier-like CDEs still get a uniqueness safety-net check, and any CDE
 * flagged nullable in the doc gets an explicit not-null enforcement check.
 */

import { isEtlSystemField } from '@/lib/etlSystemFields';

// Note: no \b boundaries around these — snake_case field names put most of these words
// after a literal underscore (e.g. "total_amount", "active_flag", "customer_ssn"), and an
// underscore is itself a word character, so \b would never match there and the pattern would
// silently fail on exactly the field names it's meant to catch.
// Note: deliberately excludes "_code" -- a "_code" suffix is just as often a classification/status
// code (expected to repeat across rows) as a genuinely unique identifier, so it's not safe to
// assume uniqueness from the name alone. It still counts toward general criticality below (a
// "_code" field is still worth a not-null check), just not toward the uniqueness safety net.
const CDE_IDENTIFIER_PATTERNS = [/^id$/i, /_id$/i, /_key$/i, /_number$/i, /ssn/i, /account_number/i];

const CDE_CRITICAL_PATTERNS = [
  /amount|amt/i,
  /balance/i,
  /price/i,
  /cost/i,
  /total/i,
  /revenue/i,
  /payment/i,
  /salary/i,
  /fee/i,
  /status/i,
  /flag/i,
  /indicator/i,
  /_code$/i,
];

/** Identifier-like fields (id/key/code/number) — expected to be unique even without a formal PK. */
export function isCdeIdentifier(fieldName: string): boolean {
  if (isEtlSystemField(fieldName)) return false; // e.g. batch_id/run_id are infra IDs, not business identifiers
  return CDE_IDENTIFIER_PATTERNS.some((p) => p.test(fieldName));
}

/** Any field a data-governance team would typically flag as critical — identifiers plus financial/status fields. */
export function isCriticalDataElement(fieldName: string): boolean {
  if (isEtlSystemField(fieldName)) return false;
  return isCdeIdentifier(fieldName) || CDE_CRITICAL_PATTERNS.some((p) => p.test(fieldName));
}
