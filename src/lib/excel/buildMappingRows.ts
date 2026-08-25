import type { MappingRow, SheetData } from '@/types/mapping';
import type { DetectedColumn, MappingFieldKey } from '@/types/columnMapping';

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x', 'pk']);

function parseBoolean(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return TRUTHY.has(text);
}

/** Trimmed cell value with any internal newlines/whitespace-runs collapsed to a single space --
 *  safe for any field except sourceField/targetField, which need the raw (pre-split) value. */
function getValue(record: Record<string, unknown>, header: string | null): string {
  if (!header) return '';
  return String(record[header] ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Trimmed at the ends only -- preserves internal newlines so callers can detect/split multi-value cells. */
function getRawValue(record: Record<string, unknown>, header: string | null): string {
  if (!header) return '';
  return String(record[header] ?? '').trim();
}

/**
 * Splits a cell's raw text on embedded line breaks. Real-world mapping docs sometimes have two
 * field names stacked in one cell via Alt+Enter (a copy/paste or manual-entry artifact) -- if we
 * don't split these apart, the two names get treated as a single garbled field name wherever it's
 * used as a SQL identifier.
 */
function splitMultilineValue(raw: string): string[] {
  return raw
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildMappingRows(
  sheet: SheetData,
  columns: DetectedColumn<MappingFieldKey>[]
): MappingRow[] {
  const byField = new Map(columns.map((c) => [c.field, c]));
  const get = (field: MappingFieldKey) => byField.get(field) ?? null;

  const pkColumn = get('primaryKeyFlag');
  const nullableColumn = get('nullableFlag');

  return sheet.rows
    .flatMap((row, index) => {
      const sourceFieldRaw = getRawValue(row, get('sourceField')?.matchedHeader ?? null);
      const targetFieldRaw = getRawValue(row, get('targetField')?.matchedHeader ?? null);

      const sourceLines = splitMultilineValue(sourceFieldRaw);
      const targetLines = splitMultilineValue(targetFieldRaw);
      const lineCount = Math.max(sourceLines.length, targetLines.length, 1);

      const nullableRaw = nullableColumn ? parseBoolean(row[nullableColumn.matchedHeader ?? '']) : true;
      const isNullable = nullableColumn ? (nullableColumn.inverted ? !nullableRaw : nullableRaw) : true;

      const shared = {
        sourceTable: getValue(row, get('sourceTable')?.matchedHeader ?? null),
        sourceSchema: getValue(row, get('sourceSchema')?.matchedHeader ?? null),
        transformation: getValue(row, get('transformation')?.matchedHeader ?? null),
        targetTable: getValue(row, get('targetTable')?.matchedHeader ?? null),
        targetSchema: getValue(row, get('targetSchema')?.matchedHeader ?? null),
        sourceDatatype: getValue(row, get('sourceDatatype')?.matchedHeader ?? null),
        targetDatatype: getValue(row, get('targetDatatype')?.matchedHeader ?? null),
        isPrimaryKey: pkColumn ? parseBoolean(row[pkColumn.matchedHeader ?? '']) : false,
        isNullable: nullableColumn ? isNullable : true,
        sourceFileLocation: getValue(row, get('sourceFileLocation')?.matchedHeader ?? null) || undefined,
        sourceFileName: getValue(row, get('sourceFileName')?.matchedHeader ?? null) || undefined,
        rawRow: row,
        sheetRowNumber: sheet.headerRowIndex + index + 2,
      };

      return Array.from({ length: lineCount }, (_, lineIndex): MappingRow => {
        const sourceField = sourceLines[lineIndex] ?? sourceLines[0] ?? '';
        const targetField = targetLines[lineIndex] ?? targetLines[0] ?? '';
        return {
          id: lineCount > 1 ? `map-${index}-${lineIndex}` : `map-${index}`,
          sourceField,
          targetField,
          ...shared,
        };
      });
    })
    .filter((r) => r.sourceField || r.targetField);
}
