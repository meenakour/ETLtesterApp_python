import { describe, expect, it } from 'vitest';
import { inferFileFormat, buildFilePath } from '@/lib/fileFormat';

describe('inferFileFormat', () => {
  it('infers common formats from the file extension', () => {
    expect(inferFileFormat('customers.csv')).toBe('csv');
    expect(inferFileFormat('customers.tsv')).toBe('csv');
    expect(inferFileFormat('customers.parquet')).toBe('parquet');
    expect(inferFileFormat('customers.json')).toBe('json');
    expect(inferFileFormat('customers.jsonl')).toBe('json');
    expect(inferFileFormat('customers.delta')).toBe('delta');
  });

  it('is case-insensitive', () => {
    expect(inferFileFormat('CUSTOMERS.CSV')).toBe('csv');
  });

  it('returns null for an unrecognized or missing extension', () => {
    expect(inferFileFormat('customers')).toBeNull();
    expect(inferFileFormat('customers.txt')).toBeNull();
    expect(inferFileFormat('')).toBeNull();
  });
});

describe('buildFilePath', () => {
  it('joins a location and file name with a separator', () => {
    expect(buildFilePath('/mnt/landing', 'customers.csv')).toBe('/mnt/landing/customers.csv');
  });

  it('does not double up an existing trailing separator', () => {
    expect(buildFilePath('/mnt/landing/', 'customers.csv')).toBe('/mnt/landing/customers.csv');
  });

  it('falls back to just the file name when location is blank', () => {
    expect(buildFilePath('', 'customers.csv')).toBe('customers.csv');
    expect(buildFilePath(undefined, 'customers.csv')).toBe('customers.csv');
  });

  it('falls back to just the location when file name is blank', () => {
    expect(buildFilePath('/mnt/landing/customers.csv', '')).toBe('/mnt/landing/customers.csv');
  });
});
