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

/**
 * Some mapping docs list more than one source table in a single Source Table cell (e.g.
 * "srctb1 ,srctb2") when a transformation draws from multiple tables at once (their Source Column
 * cell correspondingly lists "column_1,att_1" -- see businessRuleHeuristics/transformationSql for
 * how those individual column names get recovered for classification). A row's `sourceTable` is
 * used everywhere as a single physical FROM-clause table, though, so only the first is kept here --
 * any additional tables are expected to be documented as joins in the joins sheet instead, which is
 * how their row/schema/referential-integrity checks already get attached.
 */
function firstTableName(value: string): string {
  const [first] = value.split(/[,;]|\band\b|&/i);
  return (first ?? '').trim();
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

      // A blank cell in a *matched* nullable-flag column is not the same signal as an explicit
      // "N" -- it means this particular row's value was never filled in, not that the analyst
      // affirmatively declared the field NOT NULL. Treating blank the same as an explicit falsy
      // value would fabricate a constraint the document never actually asserted (seen in a real
      // doc where every single row left this column blank, wrongly flagging nearly every field as
      // NOT NULL) -- so a blank cell falls back to the same permissive default as the column being
      // entirely absent, regardless of whether the column is a normal or inverted ("Mandatory") one.
      const nullableCellBlank = !nullableColumn || getValue(row, nullableColumn.matchedHeader ?? null) === '';
      const nullableRaw = nullableColumn ? parseBoolean(row[nullableColumn.matchedHeader ?? '']) : true;
      const isNullable = nullableCellBlank ? true : nullableColumn!.inverted ? !nullableRaw : nullableRaw;

      const shared = {
        sourceTable: firstTableName(getValue(row, get('sourceTable')?.matchedHeader ?? null)),
        sourceSchema: getValue(row, get('sourceSchema')?.matchedHeader ?? null),
        transformation: getValue(row, get('transformation')?.matchedHeader ?? null),
        targetTable: getValue(row, get('targetTable')?.matchedHeader ?? null),
        targetSchema: getValue(row, get('targetSchema')?.matchedHeader ?? null),
        targetDatatype: getValue(row, get('targetDatatype')?.matchedHeader ?? null),
        isPrimaryKey: pkColumn ? parseBoolean(row[pkColumn.matchedHeader ?? '']) : false,
        isNullable,
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
