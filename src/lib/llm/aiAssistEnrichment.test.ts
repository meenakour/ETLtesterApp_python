import { describe, expect, it, vi, beforeEach } from 'vitest';
import { enrichManualReviewCasesWithAi, countAiEligibleCases } from '@/lib/llm/aiAssistEnrichment';
import { makeMappingRow, buildContext, makeTestCase } from '@/lib/generators/testHelpers';
import { classifyTransformationWithAi } from '@/lib/llm/aiAssist';

vi.mock('@/lib/llm/aiAssist', () => ({
  classifyTransformationWithAi: vi.fn(),
}));

const mockClassify = vi.mocked(classifyTransformationWithAi);

describe('countAiEligibleCases', () => {
  it('counts only Manual Review Transformation/Business Rule cases', () => {
    const testCases = [
      makeTestCase({ id: 'a', category: 'TRANSFORMATION_VALIDATION', isManualReview: true }),
      makeTestCase({ id: 'b', category: 'BUSINESS_RULE', isManualReview: true }),
      makeTestCase({ id: 'c', category: 'TRANSFORMATION_VALIDATION', isManualReview: false }),
      makeTestCase({ id: 'd', category: 'DQ_CHECKS', isManualReview: true }),
    ];
    expect(countAiEligibleCases(testCases)).toBe(2);
  });
});

describe('enrichManualReviewCasesWithAi', () => {
  beforeEach(() => {
    mockClassify.mockReset();
  });

  it('applies a valid AI-suggested expression: flips isManualReview off, flags isAiSuggested, rebuilds the SQL', async () => {
    const row = makeMappingRow({
      sourceTable: 'orders_raw',
      sourceField: 'amount',
      targetTable: 'orders',
      targetField: 'total_with_tax',
      transformation: 'multiply amount by the tax rate',
    });
    // "tax_rate" is mapped elsewhere in the doc -- a legitimate sibling reference, per the
    // known-field-widening fix -- so the AI's suggested expression should be trusted.
    const taxRateRow = makeMappingRow({ sourceTable: 'orders_raw', sourceField: 'tax_rate', targetTable: 'orders', targetField: 'tax_rate_display' });
    const testCase = makeTestCase({
      id: 'TC-BR-001',
      category: 'BUSINESS_RULE',
      isManualReview: true,
      targetTable: 'orders',
      sourceMappingRowIds: [row.id],
    });
    mockClassify.mockResolvedValue({ ok: true, expression: 'amount * tax_rate' });

    const ctx = buildContext([row, taxRateRow]);
    const result = await enrichManualReviewCasesWithAi([testCase], ctx, 'http://localhost:8787');

    expect(result).toHaveLength(1);
    expect(result[0].isManualReview).toBe(false);
    expect(result[0].isAiSuggested).toBe(true);
    expect(result[0].sql).toContain('s.`amount` * s.`tax_rate`');
    expect(result[0].sql).toContain('SOURCE query');
    expect(result[0].sql).toContain('TARGET query');
  });

  it('rejects an AI-suggested expression that references an unknown field, leaving the case unchanged', async () => {
    const row = makeMappingRow({
      sourceTable: 'orders_raw',
      sourceField: 'amount',
      targetTable: 'orders',
      targetField: 'total_with_tax',
      transformation: 'multiply amount by the tax rate',
    });
    const testCase = makeTestCase({
      id: 'TC-BR-001',
      category: 'BUSINESS_RULE',
      isManualReview: true,
      targetTable: 'orders',
      sourceMappingRowIds: [row.id],
      sql: 'original placeholder sql',
    });
    // "tax_rate" is not a known field anywhere in this mapping doc -- must not be trusted.
    mockClassify.mockResolvedValue({ ok: true, expression: 'amount * tax_rate' });

    const ctx = buildContext([{ ...row, sourceField: 'amount' }]);
    const result = await enrichManualReviewCasesWithAi(
      [testCase],
      { ...ctx, allMappingRows: [row] }, // only "amount" is known, not "tax_rate"
      'http://localhost:8787'
    );

    expect(result[0]).toEqual(testCase);
  });

  it('leaves non-eligible cases (not manual review, or a different category) completely untouched', async () => {
    const row = makeMappingRow({ targetTable: 'orders', targetField: 'x' });
    const nonManualReview = makeTestCase({ id: 'a', category: 'TRANSFORMATION_VALIDATION', isManualReview: false, sourceMappingRowIds: [row.id] });
    const wrongCategory = makeTestCase({ id: 'b', category: 'DQ_CHECKS', isManualReview: true, sourceMappingRowIds: [row.id] });

    const ctx = buildContext([row]);
    const result = await enrichManualReviewCasesWithAi([nonManualReview, wrongCategory], ctx, 'http://localhost:8787');

    expect(result).toEqual([nonManualReview, wrongCategory]);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it('leaves a case unchanged when the AI Assist call fails or returns no expression', async () => {
    const row = makeMappingRow({ targetTable: 'orders', targetField: 'x', transformation: 'do something complex' });
    const testCase = makeTestCase({ id: 'a', category: 'BUSINESS_RULE', isManualReview: true, sourceMappingRowIds: [row.id] });
    mockClassify.mockResolvedValue({ ok: false, error: 'network error' });

    const ctx = buildContext([row]);
    const result = await enrichManualReviewCasesWithAi([testCase], ctx, 'http://localhost:8787');

    expect(result[0]).toEqual(testCase);
  });
});
