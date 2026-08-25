import { describe, expect, it } from 'vitest';
import { isEtlSystemField } from '@/lib/etlSystemFields';

describe('isEtlSystemField', () => {
  it('matches the exact fields called out as noisy', () => {
    expect(isEtlSystemField('etl_timestamp')).toBe(true);
    expect(isEtlSystemField('etl_date')).toBe(true);
    expect(isEtlSystemField('data_quality_check')).toBe(true);
  });

  it('matches common load/insert/update/modify audit timestamp columns', () => {
    expect(isEtlSystemField('load_date')).toBe(true);
    expect(isEtlSystemField('load_timestamp')).toBe(true);
    expect(isEtlSystemField('dw_load_date')).toBe(true);
    expect(isEtlSystemField('record_insert_ts')).toBe(true);
    expect(isEtlSystemField('created_date')).toBe(true);
    expect(isEtlSystemField('create_ts')).toBe(true);
    expect(isEtlSystemField('updated_timestamp')).toBe(true);
    expect(isEtlSystemField('modified_dt')).toBe(true);
  });

  it('matches batch/run/job IDs and record source', () => {
    expect(isEtlSystemField('batch_id')).toBe(true);
    expect(isEtlSystemField('run_id')).toBe(true);
    expect(isEtlSystemField('job_id')).toBe(true);
    expect(isEtlSystemField('record_source')).toBe(true);
  });

  it('does not false-positive on business fields that merely contain a similar substring', () => {
    // "download_count" contains "load" as a raw substring -- must not match.
    expect(isEtlSystemField('download_count')).toBe(false);
    expect(isEtlSystemField('customer_id')).toBe(false);
    expect(isEtlSystemField('email')).toBe(false);
    expect(isEtlSystemField('order_date')).toBe(false);
  });
});
