import { describe, expect, it } from 'vitest';
import { resolveReference, resolveSourceReference, resolveTargetReference } from '@/lib/sql/sourceReference';
import { makeMappingRow } from '@/lib/generators/testHelpers';
import { DEFAULT_TABLE_TYPE_CONFIG } from '@/types/tableTypeConfig';

describe('resolveReference', () => {
  it('returns a quoted table reference for kind=table', () => {
    expect(resolveReference('table', 'raw', 'customers', undefined, undefined)).toBe('`raw`.`customers`');
  });

  it('returns a file.`path` reference for kind=file with a path', () => {
    expect(resolveReference('file', undefined, 'customers', 'csv', '/mnt/landing/customers.csv')).toBe(
      'csv.`/mnt/landing/customers.csv`'
    );
  });

  it('falls back to the table reference when kind=file but no path is available', () => {
    expect(resolveReference('file', 'raw', 'customers', 'csv', undefined)).toBe('`raw`.`customers`');
  });
});

describe('resolveSourceReference', () => {
  it('uses a normal table reference by default', () => {
    const rows = [makeMappingRow({ sourceTable: 'customers', sourceSchema: 'raw' })];
    expect(resolveSourceReference(DEFAULT_TABLE_TYPE_CONFIG, rows, 'raw', 'customers')).toBe('`raw`.`customers`');
  });

  it('auto-detects the file path/format from the group rows when sourceKind is file', () => {
    const rows = [makeMappingRow({ sourceFileLocation: '/mnt/landing', sourceFileName: 'customers.csv' })];
    const config = { ...DEFAULT_TABLE_TYPE_CONFIG, sourceKind: 'file' as const };
    expect(resolveSourceReference(config, rows, undefined, 'customers')).toBe('csv.`/mnt/landing/customers.csv`');
  });

  it('falls back to the manual override when the doc has no file-location columns', () => {
    const rows = [makeMappingRow({})];
    const config = {
      ...DEFAULT_TABLE_TYPE_CONFIG,
      sourceKind: 'file' as const,
      sourceFilePathOverride: '/mnt/landing/customers.parquet',
      sourceFileFormatOverride: 'parquet' as const,
    };
    expect(resolveSourceReference(config, rows, undefined, 'customers')).toBe(
      'parquet.`/mnt/landing/customers.parquet`'
    );
  });
});

describe('resolveTargetReference', () => {
  it('uses a normal table reference by default', () => {
    expect(resolveTargetReference(DEFAULT_TABLE_TYPE_CONFIG, 'curated', 'customers')).toBe('`curated`.`customers`');
  });

  it('uses the manual override path/format when targetKind is file', () => {
    const config = {
      ...DEFAULT_TABLE_TYPE_CONFIG,
      targetKind: 'file' as const,
      targetFilePathOverride: '/mnt/out/customers.json',
      targetFileFormatOverride: 'json' as const,
    };
    expect(resolveTargetReference(config, undefined, 'customers')).toBe('json.`/mnt/out/customers.json`');
  });
});
