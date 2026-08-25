const STOPWORDS = new Set(['the', 'a', 'of', 'name']);

export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !STOPWORDS.has(tok))
    .join(' ');
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

/** Dice's coefficient over bigrams of the token-joined string. */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };

  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  let intersection = 0;
  for (const [bg, countA] of bigramsA) {
    const countB = bigramsB.get(bg);
    if (countB) intersection += Math.min(countA, countB);
  }
  const totalA = [...bigramsA.values()].reduce((s, v) => s + v, 0);
  const totalB = [...bigramsB.values()].reduce((s, v) => s + v, 0);
  if (totalA + totalB === 0) return 0;
  return (2 * intersection) / (totalA + totalB);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/** Similarity score in [0, ~1.15] between a normalized header and a normalized alias. */
export function headerAliasScore(header: string, alias: string): number {
  const maxLen = Math.max(header.length, alias.length) || 1;
  const dice = diceCoefficient(header, alias);
  const lev = 1 - levenshtein(header, alias) / maxLen;
  const tokenA = new Set(tokenize(header));
  const tokenB = new Set(tokenize(alias));
  const containsBonus = header.includes(alias) || alias.includes(header) ? 0.15 : 0;
  const tokenOverlapBonus =
    tokenB.size > 0 && [...tokenB].every((t) => tokenA.has(t)) ? 0.1 : 0;
  return 0.6 * dice + 0.3 * lev + containsBonus + tokenOverlapBonus;
}
