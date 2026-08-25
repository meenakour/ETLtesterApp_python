import type { JoinFilterRow, SheetData } from '@/types/mapping';
import type { DetectedColumn, JoinFieldKey } from '@/types/columnMapping';

function getValue(record: Record<string, unknown>, header: string | null): string {
  if (!header) return '';
  return String(record[header] ?? '').trim();
}

function splitTableList(text: string): string[] {
  if (!text) return [];
  return text
    .split(/,|;|\band\b|&/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function buildJoinFilterRows(
  sheet: SheetData,
  columns: DetectedColumn<JoinFieldKey>[]
): JoinFilterRow[] {
  const byField = new Map(columns.map((c) => [c.field, c]));
  const get = (field: JoinFieldKey) => byField.get(field) ?? null;

  return sheet.rows
    .map((row, index) => {
      const tableName = getValue(row, get('tableName')?.matchedHeader ?? null);
      const tablesInvolvedRaw = getValue(row, get('tablesInvolved')?.matchedHeader ?? null);

      const joinFilterRow: JoinFilterRow = {
        id: `join-${index}`,
        tableName,
        schemaName: getValue(row, get('schemaName')?.matchedHeader ?? null) || undefined,
        joinType: getValue(row, get('joinType')?.matchedHeader ?? null) || undefined,
        joinCondition: getValue(row, get('joinCondition')?.matchedHeader ?? null) || undefined,
        tablesInvolved: splitTableList(tablesInvolvedRaw),
        filterCondition: getValue(row, get('filterCondition')?.matchedHeader ?? null) || undefined,
        rawRow: row,
        sheetRowNumber: sheet.headerRowIndex + index + 2,
      };
      return joinFilterRow;
    })
    .filter((r) => r.tableName || r.tablesInvolved.length > 0 || r.joinCondition || r.filterCondition);
}
