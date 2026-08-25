import type { JoinFilterRow, MappingRow } from '@/types/mapping';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';

export interface JoinAssociation {
  /** Every join/filter row this table participates in (primary "Table" match OR listed in "Tables Involved"). Used for referential-integrity lookups and the association summary. */
  joinsByTable: Map<string, JoinFilterRow[]>;
  /** Only join/filter rows explicitly documented against this table (the "Table" column matches). Used to scope row-count filters so a join documented for table A doesn't leak into table B's count query. */
  primaryJoinsByTable: Map<string, JoinFilterRow[]>;
  ambiguousTables: string[];
}

export function buildJoinIndex(joinRows: JoinFilterRow[]): JoinAssociation {
  const joinsByTable = new Map<string, JoinFilterRow[]>();
  const primaryJoinsByTable = new Map<string, JoinFilterRow[]>();
  const sourceCounts = new Map<string, Set<string>>();

  const addEntry = (map: Map<string, JoinFilterRow[]>, tableKey: string, row: JoinFilterRow) => {
    if (!tableKey) return;
    const list = map.get(tableKey) ?? [];
    if (!list.includes(row)) list.push(row);
    map.set(tableKey, list);
  };

  for (const row of joinRows) {
    const primaryKey = normalizeTableName(row.tableName);
    if (primaryKey) {
      addEntry(joinsByTable, primaryKey, row);
      addEntry(primaryJoinsByTable, primaryKey, row);
      const origins = sourceCounts.get(primaryKey) ?? new Set<string>();
      origins.add(row.schemaName ?? 'default');
      sourceCounts.set(primaryKey, origins);
    }

    for (const involved of row.tablesInvolved) {
      const key = normalizeTableName(involved);
      if (key) addEntry(joinsByTable, key, row);
    }
  }

  const ambiguousTables = [...sourceCounts.entries()]
    .filter(([, origins]) => origins.size > 1)
    .map(([table]) => table);

  return { joinsByTable, primaryJoinsByTable, ambiguousTables };
}

export function joinsForTable(index: JoinAssociation, tableName: string): JoinFilterRow[] {
  return index.joinsByTable.get(normalizeTableName(tableName)) ?? [];
}

/** Only joins/filters explicitly documented against this exact table — safe to apply to that table's own queries. */
export function primaryJoinsForTable(index: JoinAssociation, tableName: string): JoinFilterRow[] {
  return index.primaryJoinsByTable.get(normalizeTableName(tableName)) ?? [];
}

export function groupMappingRowsByTargetTable(rows: MappingRow[]): Map<string, MappingRow[]> {
  const grouped = new Map<string, MappingRow[]>();
  for (const row of rows) {
    const key = row.targetTable || '(unspecified table)';
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}
