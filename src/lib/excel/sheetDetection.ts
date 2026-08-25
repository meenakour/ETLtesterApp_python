import * as XLSX from 'xlsx';
import { headerAliasScore, normalizeHeader } from '@/lib/fuzzyMatch';
import { MAPPING_FIELD_ALIASES, JOIN_FIELD_ALIASES } from '@/lib/excel/aliases';
import type { SheetData } from '@/types/mapping';

const MAX_HEADER_SCAN_ROWS = 10;
const HEADER_MATCH_THRESHOLD = 0.5;

function allAliasStrings(aliasMap: Record<string, { aliases: string[]; inverseAliases?: string[] }>): string[] {
  return Object.values(aliasMap).flatMap((spec) => [...spec.aliases, ...(spec.inverseAliases ?? [])]);
}

const MAPPING_ALIAS_POOL = allAliasStrings(MAPPING_FIELD_ALIASES).map(normalizeHeader);
const JOIN_ALIAS_POOL = allAliasStrings(JOIN_FIELD_ALIASES).map(normalizeHeader);

function scoreRowAgainstPool(cells: unknown[], pool: string[]): number {
  let hits = 0;
  for (const cell of cells) {
    const text = normalizeHeader(String(cell ?? ''));
    if (!text) continue;
    const best = Math.max(0, ...pool.map((alias) => headerAliasScore(text, alias)));
    if (best >= HEADER_MATCH_THRESHOLD) hits += 1;
  }
  return hits;
}

/** Finds the most likely header row within the first N rows of a sheet's raw AOA data. */
function findHeaderRowIndex(aoa: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  const scanLimit = Math.min(MAX_HEADER_SCAN_ROWS, aoa.length);
  for (let i = 0; i < scanLimit; i++) {
    const row = aoa[i] ?? [];
    const nonEmptyCount = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '').length;
    if (nonEmptyCount === 0) continue;
    const aliasHits =
      scoreRowAgainstPool(row, MAPPING_ALIAS_POOL) + scoreRowAgainstPool(row, JOIN_ALIAS_POOL);
    const score = nonEmptyCount * 0.1 + aliasHits;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function extractSheetData(workbook: XLSX.WorkBook, sheetName: string): SheetData {
  const sheet = workbook.Sheets[sheetName];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

  if (aoa.length === 0) {
    return { sheetName, headers: [], headerRowIndex: 0, rows: [] };
  }

  const headerRowIndex = findHeaderRowIndex(aoa);
  const headerRow = aoa[headerRowIndex] ?? [];
  const headers = headerRow.map((h, i) => (String(h ?? '').trim() || `Column ${i + 1}`));

  const rows: Record<string, unknown>[] = [];
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const isBlank = row.every((c) => c === undefined || c === null || String(c).trim() === '');
    if (isBlank) continue;
    const record: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      record[h] = row[idx] ?? '';
    });
    rows.push(record);
  }

  return { sheetName, headers, headerRowIndex, rows };
}

export interface SheetClassification {
  mappingSheetName: string | null;
  joinsSheetName: string | null;
  ambiguous: boolean;
  scores: Record<string, { mappingScore: number; joinsScore: number }>;
}

/** Scores every sheet in the workbook against mapping vs. joins alias pools to auto-assign roles. */
export function classifySheets(workbook: XLSX.WorkBook): SheetClassification {
  const scores: Record<string, { mappingScore: number; joinsScore: number }> = {};

  for (const sheetName of workbook.SheetNames) {
    const data = extractSheetData(workbook, sheetName);
    let mappingScore = 0;
    let joinsScore = 0;
    for (const header of data.headers) {
      const normalized = normalizeHeader(header);
      if (!normalized) continue;
      const mBest = Math.max(0, ...MAPPING_ALIAS_POOL.map((a) => headerAliasScore(normalized, a)));
      const jBest = Math.max(0, ...JOIN_ALIAS_POOL.map((a) => headerAliasScore(normalized, a)));
      if (mBest >= HEADER_MATCH_THRESHOLD) mappingScore += mBest;
      if (jBest >= HEADER_MATCH_THRESHOLD) joinsScore += jBest;
    }
    scores[sheetName] = { mappingScore, joinsScore };
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return { mappingSheetName: null, joinsSheetName: null, ambiguous: true, scores };
  }

  if (sheetNames.length === 1) {
    return { mappingSheetName: sheetNames[0], joinsSheetName: null, ambiguous: false, scores };
  }

  const rankedForMapping = [...sheetNames].sort((a, b) => scores[b].mappingScore - scores[a].mappingScore);
  const mappingSheetName = rankedForMapping[0];

  const rankedForJoins = sheetNames
    .filter((s) => s !== mappingSheetName)
    .sort((a, b) => scores[b].joinsScore - scores[a].joinsScore);
  const joinsSheetName = rankedForJoins[0] ?? null;

  const margin =
    sheetNames.length >= 2
      ? scores[mappingSheetName].mappingScore - (scores[rankedForMapping[1]]?.mappingScore ?? 0)
      : 1;
  const ambiguous = margin < 0.15 * Math.max(1, scores[mappingSheetName].mappingScore);

  return { mappingSheetName, joinsSheetName, ambiguous, scores };
}
