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

// Some mapping docs don't give filters their own column at all -- instead, after the documented
// joins, a literal "filter" label row marks the start of a section where each following row is a
// bare standalone condition string (e.g. "srctb1.bgn_dt <CURRENT_DATE") sitting in what would
// otherwise be the Table Name column, with every other column left blank. Nothing here says which
// table each condition belongs to except the condition text itself.
const FILTER_SECTION_MARKER = /^filters?$/i;
const LEADING_TABLE_REF = /^([A-Za-z_][A-Za-z0-9_]*)\./;

export function buildJoinFilterRows(
  sheet: SheetData,
  columns: DetectedColumn<JoinFieldKey>[]
): JoinFilterRow[] {
  const byField = new Map(columns.map((c) => [c.field, c]));
  const get = (field: JoinFieldKey) => byField.get(field) ?? null;
  const tableNameHeader = get('tableName')?.matchedHeader ?? null;

  const rows: JoinFilterRow[] = [];
  let inFilterSection = false;

  sheet.rows.forEach((row, index) => {
    const rawTableNameCell = getValue(row, tableNameHeader);

    if (FILTER_SECTION_MARKER.test(rawTableNameCell)) {
      inFilterSection = true;
      return; // the marker row itself isn't a real join/filter row
    }

    if (inFilterSection) {
      const conditionText = rawTableNameCell;
      const inferredTable = conditionText.match(LEADING_TABLE_REF)?.[1];
      if (!conditionText || !inferredTable) return; // can't tell which table this applies to -- skip rather than guess
      rows.push({
        id: `join-${index}`,
        tableName: inferredTable,
        tablesInvolved: [inferredTable],
        filterCondition: conditionText,
        rawRow: row,
        sheetRowNumber: sheet.headerRowIndex + index + 2,
      });
      return;
    }

    const tableName = getValue(row, tableNameHeader);
    const tablesInvolvedRaw = getValue(row, get('tablesInvolved')?.matchedHeader ?? null);

    // A join row's own Table Name is, by definition, always one of the tables involved in it --
    // but some mapping docs split a join's two sides into separate "Table1"/"Table2" columns
    // rather than one combined "Tables Involved" list. In that shape, the fuzzy column matcher
    // only ever picks up the second column as "Tables Involved" (the first is claimed by "Table
    // Name" instead), so the parsed list would silently be missing the row's own primary table.
    // Every downstream join/filter-relevance check keys off `tablesInvolved` containing the
    // table it's building a query for, so this omission would make the join look irrelevant from
    // the primary table's own side and get silently dropped. Union with `tableName` unconditionally
    // so this holds regardless of which column layout the sheet uses.
    const normalizedTableName = tableName.trim().toLowerCase();
    const parsedTablesInvolved = splitTableList(tablesInvolvedRaw);
    const tablesInvolved = tableName
      ? [tableName, ...parsedTablesInvolved.filter((t) => t.trim().toLowerCase() !== normalizedTableName)]
      : parsedTablesInvolved;

    const joinFilterRow: JoinFilterRow = {
      id: `join-${index}`,
      tableName,
      schemaName: getValue(row, get('schemaName')?.matchedHeader ?? null) || undefined,
      joinType: getValue(row, get('joinType')?.matchedHeader ?? null) || undefined,
      joinCondition: getValue(row, get('joinCondition')?.matchedHeader ?? null) || undefined,
      tablesInvolved,
      filterCondition: getValue(row, get('filterCondition')?.matchedHeader ?? null) || undefined,
      rawRow: row,
      sheetRowNumber: sheet.headerRowIndex + index + 2,
    };
    if (joinFilterRow.tableName || joinFilterRow.tablesInvolved.length > 0 || joinFilterRow.joinCondition || joinFilterRow.filterCondition) {
      rows.push(joinFilterRow);
    }
  });

  return rows;
}
