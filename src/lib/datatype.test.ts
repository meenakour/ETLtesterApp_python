import { describe, expect, it } from 'vitest';
import { classifyDatatype, parseDecimalScale, parseLength } from '@/lib/datatype';

describe('classifyDatatype', () => {
  it('classifies string types', () => {
    expect(classifyDatatype('VARCHAR(50)')).toBe('string');
    expect(classifyDatatype('CHAR(1)')).toBe('string');
    expect(classifyDatatype('STRING')).toBe('string');
    expect(classifyDatatype('text')).toBe('string');
  });

  it('classifies numeric types', () => {
    expect(classifyDatatype('INT')).toBe('numeric');
    expect(classifyDatatype('DECIMAL(10,2)')).toBe('numeric');
    expect(classifyDatatype('BIGINT')).toBe('numeric');
    expect(classifyDatatype('DOUBLE')).toBe('numeric');
  });

  it('classifies date/timestamp types', () => {
    expect(classifyDatatype('DATE')).toBe('date');
    expect(classifyDatatype('TIMESTAMP')).toBe('date');
  });

  it('classifies boolean types', () => {
    expect(classifyDatatype('BOOLEAN')).toBe('boolean');
    expect(classifyDatatype('BIT')).toBe('boolean');
  });

  it('returns unknown for unrecognized or blank types', () => {
    expect(classifyDatatype('')).toBe('unknown');
    expect(classifyDatatype('SOME_WEIRD_TYPE')).toBe('unknown');
  });
});

describe('parseLength', () => {
  it('extracts the length from a VARCHAR(n) declaration', () => {
    expect(parseLength('VARCHAR(100)')).toBe(100);
  });

  it('returns null when no length is present', () => {
    expect(parseLength('STRING')).toBeNull();
  });
});

describe('parseDecimalScale', () => {
  it('extracts the scale from a DECIMAL(p,s) declaration', () => {
    expect(parseDecimalScale('DECIMAL(10,2)')).toBe(2);
    expect(parseDecimalScale('DECIMAL(5, 4)')).toBe(4);
  });

  it('returns null when there is no scale component', () => {
    expect(parseDecimalScale('INT')).toBeNull();
    expect(parseDecimalScale('VARCHAR(50)')).toBeNull();
  });
});
