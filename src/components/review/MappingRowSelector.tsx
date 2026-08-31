import { useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { groupMappingRowsByTargetTable } from '@/lib/excel/associateJoins';
import { Button } from '@/components/common/Button';
import type { MappingRow } from '@/types/mapping';

/** Lets the user select/deselect individual mapping fields before generation -- only selected
 *  rows are used to build the generator context (see useMappingData.ts). Always operates on the
 *  full, unfiltered mapping-row list so it can show every row regardless of the current selection. */
export function MappingRowSelector({ mappingRows }: { mappingRows: MappingRow[] }) {
  const { state, actions } = useAppState();

  const grouped = useMemo(() => groupMappingRowsByTargetTable(mappingRows), [mappingRows]);
  const allIds = useMemo(() => mappingRows.map((r) => r.id), [mappingRows]);
  const selectedIds = useMemo(
    () => (state.selectedMappingRowIds === null ? new Set(allIds) : new Set(state.selectedMappingRowIds)),
    [state.selectedMappingRowIds, allIds]
  );

  if (mappingRows.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No mapping rows parsed yet.</p>;
  }

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    actions.setSelectedMappingRowIds([...next]);
  };

  const setTableSelection = (tableRows: MappingRow[], select: boolean) => {
    const next = new Set(selectedIds);
    for (const row of tableRows) {
      if (select) next.add(row.id);
      else next.delete(row.id);
    }
    actions.setSelectedMappingRowIds([...next]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-muted)]">
          {selectedIds.size} of {mappingRows.length} field{mappingRows.length === 1 ? '' : 's'} selected for
          generation.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => actions.setSelectedMappingRowIds(null)}>
            Select All
          </Button>
          <Button variant="secondary" onClick={() => actions.setSelectedMappingRowIds([])}>
            Select None
          </Button>
        </div>
      </div>

      {[...grouped.entries()].map(([targetTable, rows]) => {
        const selectedInTable = rows.filter((r) => selectedIds.has(r.id)).length;
        return (
          <div key={targetTable} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {targetTable} <span className="font-normal text-[var(--color-text-muted)]">({selectedInTable}/{rows.length})</span>
              </h3>
              <div className="flex gap-3 text-xs">
                <button
                  className="text-[var(--color-accent)] hover:underline"
                  onClick={() => setTableSelection(rows, true)}
                >
                  All
                </button>
                <button
                  className="text-[var(--color-accent)] hover:underline"
                  onClick={() => setTableSelection(rows, false)}
                >
                  None
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {rows.map((row) => (
                <label key={row.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--color-surface-alt)]">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                  <span className="text-[var(--color-text-muted)]">
                    {row.sourceTable ? `${row.sourceTable}.` : ''}
                    {row.sourceField || '(blank)'}
                  </span>
                  <span className="text-[var(--color-text-muted)]">→</span>
                  <span className="font-medium">{row.targetField || '(blank)'}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
