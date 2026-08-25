export type DatatypeClass = 'string' | 'numeric' | 'date' | 'boolean' | 'unknown';

export function classifyDatatype(raw: string): DatatypeClass {
  const text = raw.toLowerCase();
  if (/\b(bool|boolean|bit|flag)\b/.test(text)) return 'boolean';
  if (/\b(date|timestamp|datetime|time)\b/.test(text)) return 'date';
  if (/\b(char|varchar|string|text|nchar|nvarchar)\b/.test(text)) return 'string';
  if (/\b(int|integer|bigint|smallint|tinyint|decimal|numeric|double|float|real|long|short|byte|number)\b/.test(text))
    return 'numeric';
  return 'unknown';
}

export function parseLength(raw: string): number | null {
  const match = raw.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

export function parseDecimalScale(raw: string): number | null {
  const match = raw.match(/\(\s*\d+\s*,\s*(\d+)\s*\)/);
  return match ? parseInt(match[1], 10) : null;
}
