import { AlertTriangle, Link2 } from 'lucide-react';
import { useMappingData } from '@/hooks/useMappingData';
import { joinsForTable } from '@/lib/excel/associateJoins';

export function JoinAssociationSummary() {
  const { mappingRowsByTargetTable, joinIndex } = useMappingData();

  const tables = [...mappingRowsByTargetTable.keys()];
  if (tables.length === 0) return null;

  return (
    <div className="space-y-3">
      {tables.map((table) => {
        const joins = joinsForTable(joinIndex, table);
        return (
          <div key={table} className="flex items-start gap-2 text-sm">
            <Link2 size={15} className="mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
            <div>
              <span className="font-medium">{table}</span>{' '}
              {joins.length === 0 ? (
                <span className="text-[var(--color-text-muted)]">— no joins or filters associated with this table</span>
              ) : (
                <span className="text-[var(--color-text-muted)]">
                  — {joins.length} associated join or filter condition{joins.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {joinIndex.ambiguousTables.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--color-warning-soft)] px-3 py-2 text-sm text-[var(--color-warning)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Ambiguous table association for: {joinIndex.ambiguousTables.join(', ')}. Review the joins sheet —
            the same table name appears to be documented under more than one schema.
          </span>
        </div>
      )}
    </div>
  );
}
