import { headerAliasScore, normalizeHeader } from '@/lib/fuzzyMatch';
import type { DetectedColumn } from '@/types/columnMapping';
import type { AliasSpec } from '@/lib/excel/aliases';

export const CONFIDENCE_AUTO_ACCEPT = 0.8;
export const CONFIDENCE_TENTATIVE = 0.5;

interface ScoredCandidate {
  header: string;
  score: number;
  inverted: boolean;
}

/**
 * Greedily assigns the best-scoring header to each field, ensuring no header
 * is reused across two fields. Returns one DetectedColumn per field key.
 */
export function detectColumns<K extends string>(
  headers: string[],
  aliasMap: Record<K, AliasSpec>
): DetectedColumn<K>[] {
  const fieldKeys = Object.keys(aliasMap) as K[];
  const normalizedHeaders = headers.map((h) => ({ raw: h, normalized: normalizeHeader(h) }));

  const candidatesByField = new Map<K, ScoredCandidate[]>();

  for (const field of fieldKeys) {
    const spec = aliasMap[field];
    const candidates: ScoredCandidate[] = [];
    for (const { raw, normalized } of normalizedHeaders) {
      if (!normalized) continue;
      let best = 0;
      for (const alias of spec.aliases) {
        best = Math.max(best, headerAliasScore(normalized, normalizeHeader(alias)));
      }
      let bestInverse = 0;
      for (const alias of spec.inverseAliases ?? []) {
        bestInverse = Math.max(bestInverse, headerAliasScore(normalized, normalizeHeader(alias)));
      }
      if (bestInverse > best) {
        candidates.push({ header: raw, score: bestInverse, inverted: true });
      } else if (best > 0) {
        candidates.push({ header: raw, score: best, inverted: false });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    candidatesByField.set(field, candidates);
  }

  // Greedy global assignment: repeatedly pick the highest remaining (field, header) score.
  const usedHeaders = new Set<string>();
  const assigned = new Map<K, ScoredCandidate>();
  const remainingFields = new Set(fieldKeys);

  while (remainingFields.size > 0) {
    let bestField: K | null = null;
    let bestCandidate: ScoredCandidate | null = null;

    for (const field of remainingFields) {
      const list = candidatesByField.get(field) ?? [];
      const top = list.find((c) => !usedHeaders.has(c.header));
      if (top && (!bestCandidate || top.score > bestCandidate.score)) {
        bestField = field;
        bestCandidate = top;
      }
    }

    if (!bestField || !bestCandidate) break;
    assigned.set(bestField, bestCandidate);
    usedHeaders.add(bestCandidate.header);
    remainingFields.delete(bestField);
  }

  return fieldKeys.map((field) => {
    const candidate = assigned.get(field);
    return {
      field,
      matchedHeader: candidate ? candidate.header : null,
      confidence: candidate ? candidate.score : 0,
      inverted: candidate?.inverted ?? false,
    };
  });
}

export function confidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= CONFIDENCE_AUTO_ACCEPT) return 'high';
  if (score >= CONFIDENCE_TENTATIVE) return 'medium';
  return 'low';
}
