import { describe, expect, it } from 'vitest';
import { headerAliasScore, normalizeHeader } from '@/lib/fuzzyMatch';
import { CONFIDENCE_AUTO_ACCEPT } from '@/lib/excel/columnDetection';

describe('normalizeHeader', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeHeader('Src Table')).toBe('src table');
    expect(normalizeHeader('  Target   Field  ')).toBe('target field');
    expect(normalizeHeader('PK?')).toBe('pk');
  });

  it('drops common stopwords (including "name", since alias lists rely on this to equate "Field Name" with "Field")', () => {
    expect(normalizeHeader('Field Name (Source)')).toBe('field source');
    expect(normalizeHeader('The Table')).toBe('table');
  });
});

describe('headerAliasScore', () => {
  it('scores an exact match at or above the auto-accept confidence threshold', () => {
    const score = headerAliasScore(normalizeHeader('Source Table'), normalizeHeader('source table'));
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE_AUTO_ACCEPT);
  });

  it('scores a header against its exact alias-list entry highly', () => {
    // "Src Table" is itself a literal entry in the sourceTable alias list (see aliases.ts) --
    // detectColumns takes the max score across all aliases, so this exact-match case is what
    // actually drives auto-detection, not a comparison against a *different* alias phrase.
    const score = headerAliasScore(normalizeHeader('Src Table'), normalizeHeader('src table'));
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE_AUTO_ACCEPT);
  });

  it('still scores a related-but-different alias phrase reasonably, if not at auto-accept level', () => {
    const score = headerAliasScore(normalizeHeader('Src Table'), normalizeHeader('source table'));
    expect(score).toBeGreaterThan(0.3);
  });

  it('scores unrelated headers low', () => {
    const score = headerAliasScore(normalizeHeader('Comments'), normalizeHeader('source table'));
    expect(score).toBeLessThan(0.5);
  });
});
