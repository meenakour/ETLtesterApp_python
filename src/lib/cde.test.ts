import { describe, expect, it } from 'vitest';
import { isCdeIdentifier, isCriticalDataElement } from '@/lib/cde';

describe('isCdeIdentifier', () => {
  it('matches common identifier-style field names', () => {
    expect(isCdeIdentifier('customer_id')).toBe(true);
    expect(isCdeIdentifier('id')).toBe(true);
    expect(isCdeIdentifier('account_number')).toBe(true);
    expect(isCdeIdentifier('product_key')).toBe(true);
    expect(isCdeIdentifier('ssn')).toBe(true);
  });

  it('does not match ordinary descriptive field names', () => {
    expect(isCdeIdentifier('first_name')).toBe(false);
    expect(isCdeIdentifier('description')).toBe(false);
    expect(isCdeIdentifier('email')).toBe(false);
  });

  it('regression: does NOT assume a "_code" suffix is unique -- often a repeating classification/status code', () => {
    expect(isCdeIdentifier('status_code')).toBe(false);
    expect(isCdeIdentifier('data_quality_check_code')).toBe(false);
    expect(isCdeIdentifier('source_system_code')).toBe(false);
  });
});

describe('isCriticalDataElement', () => {
  it('flags identifier-style fields as critical', () => {
    expect(isCriticalDataElement('customer_id')).toBe(true);
  });

  it('flags financial/status fields as critical even without an id-like suffix', () => {
    expect(isCriticalDataElement('balance')).toBe(true);
    expect(isCriticalDataElement('price')).toBe(true);
    expect(isCriticalDataElement('status')).toBe(true);
  });

  it('regression: matches critical keywords used as a snake_case suffix after an underscore', () => {
    // An underscore is a word character, so a naive \bword\b pattern silently fails to match
    // "total_amount"/"active_flag"/"customer_ssn" -- these must still be caught.
    expect(isCriticalDataElement('total_amount')).toBe(true);
    expect(isCriticalDataElement('active_flag')).toBe(true);
    expect(isCriticalDataElement('customer_ssn')).toBe(true);
    expect(isCriticalDataElement('account_balance')).toBe(true);
  });

  it('does not flag unrelated descriptive fields', () => {
    expect(isCriticalDataElement('first_name')).toBe(false);
    expect(isCriticalDataElement('comments')).toBe(false);
  });

  it('still flags a plain "_code" classification field as generally critical, worth a not-null check, even though not assumed unique', () => {
    expect(isCriticalDataElement('source_system_code')).toBe(true);
    // data_quality_check_code is intentionally excluded here -- it matches isEtlSystemField's
    // "data_quality_check" pattern, so it's treated as ETL/DQ infrastructure, not a business CDE.
    // See the dedicated ETL-exclusion regression test below.
  });

  it('never flags ETL-infrastructure/audit fields as critical, even when the name would otherwise match (e.g. batch_id ending in _id)', () => {
    expect(isCriticalDataElement('etl_timestamp')).toBe(false);
    expect(isCriticalDataElement('batch_id')).toBe(false);
    expect(isCdeIdentifier('batch_id')).toBe(false);
  });
});
