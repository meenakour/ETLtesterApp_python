import type { MappingRow } from '@/types/mapping';
import type { JoinAssociation } from '@/lib/excel/associateJoins';
import type { TestCase } from '@/types/testCase';
import type { TableTypeConfig } from '@/types/tableTypeConfig';

export interface GeneratorContext {
  mappingRowsByTargetTable: Map<string, MappingRow[]>;
  joinIndex: JoinAssociation;
  allMappingRows: MappingRow[];
  tableTypeConfigs: Record<string, TableTypeConfig>;
}

export type GeneratorFn = (ctx: GeneratorContext) => TestCase[];

let idCounter = 0;
export function nextDraftId(): string {
  idCounter += 1;
  return `draft-${idCounter}`;
}
