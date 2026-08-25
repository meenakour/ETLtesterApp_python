import { useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { buildMappingRows } from '@/lib/excel/buildMappingRows';
import { buildJoinFilterRows } from '@/lib/excel/buildJoinFilterRows';
import { buildJoinIndex, groupMappingRowsByTargetTable } from '@/lib/excel/associateJoins';
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

  const mappingRowsByTargetTable = useMemo(() => groupMappingRowsByTargetTable(mappingRows), [mappingRows]);

  const generatorContext: GeneratorContext = useMemo(
    () => ({ mappingRowsByTargetTable, joinIndex, allMappingRows: mappingRows, tableTypeConfigs: state.tableTypeConfigs }),
    [mappingRowsByTargetTable, joinIndex, mappingRows, state.tableTypeConfigs]
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
