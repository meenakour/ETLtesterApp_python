import { useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { buildMappingRows } from '@/lib/excel/buildMappingRows';
import { buildJoinFilterRows } from '@/lib/excel/buildJoinFilterRows';
import { buildJoinIndex, groupMappingRowsByTargetTable, filterMappingRowsBySelection } from '@/lib/excel/associateJoins';
import type { GeneratorContext } from '@/lib/generators/types';

export function useMappingData() {
  const { state } = useAppState();

  const mappingRows = useMemo(() => {
    if (!state.mappingSheet) return [];
    return buildMappingRows(state.mappingSheet, state.mappingColumns);
  }, [state.mappingSheet, state.mappingColumns]);

  const joinFilterRows = useMemo(() => {
    if (!state.joinsSheet) return [];
    return buildJoinFilterRows(state.joinsSheet, state.joinColumns);
  }, [state.joinsSheet, state.joinColumns]);

  const joinIndex = useMemo(() => buildJoinIndex(joinFilterRows), [joinFilterRows]);

  // Unfiltered -- still consumed as-is by JoinAssociationSummary/TableTypeConfigPanel (every table
  // must stay configurable regardless of which fields are selected for generation) and by
  // reviewMapping/MappingIssuesList (document review isn't affected by what you're choosing to
  // test) and the row-count display.
  const mappingRowsByTargetTable = useMemo(() => groupMappingRowsByTargetTable(mappingRows), [mappingRows]);

  // Only the generator-facing context is scoped to the user's field selection. Both
  // `mappingRowsByTargetTable` and `allMappingRows` below must be built from the SAME filtered set
  // -- 3 of the 9 generators read `allMappingRows` directly as a secondary "known fields" lookup,
  // and an inconsistency there would let a deselected field leak back in as a recognized reference
  // in another field's transformation SQL.
  const filteredMappingRows = useMemo(
    () => filterMappingRowsBySelection(mappingRows, state.selectedMappingRowIds),
    [mappingRows, state.selectedMappingRowIds]
  );

  const generatorContext: GeneratorContext = useMemo(
    () => ({
      mappingRowsByTargetTable: groupMappingRowsByTargetTable(filteredMappingRows),
      joinIndex,
      allMappingRows: filteredMappingRows,
      tableTypeConfigs: state.tableTypeConfigs,
    }),
    [filteredMappingRows, joinIndex, state.tableTypeConfigs]
  );

  const requiredFieldsResolved = useMemo(() => {
    const required = state.mappingColumns.filter((c) =>
      ['sourceField', 'targetField', 'targetTable'].includes(c.field)
    );
    const mappingOk = required.length > 0 && required.every((c) => c.matchedHeader !== null);
    const joinTableCol = state.joinColumns.find((c) => c.field === 'tableName');
    const joinsOk = !state.joinsSheet || !joinTableCol || joinTableCol.matchedHeader !== null;
    return mappingOk && joinsOk;
  }, [state.mappingColumns, state.joinColumns, state.joinsSheet]);

  return { mappingRows, joinFilterRows, joinIndex, mappingRowsByTargetTable, generatorContext, requiredFieldsResolved };
}
