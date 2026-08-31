import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { generateTestCasesFromPrompt, isValidProposedTestCase } from '@/lib/llm/generateTestCasesFromPrompt';

const VALID_CASE = {
  name: 'Check X',
  category: 'DQ_CHECKS',
  priority: 'P2',
  description: 'desc',
  steps: ['step 1'],
  expectedResult: 'expected',
  sql: 'SELECT 1;',
  targetTable: 'orders',
};

describe('isValidProposedTestCase', () => {
  it('accepts a well-formed proposal', () => {
    expect(isValidProposedTestCase(VALID_CASE)).toBe(true);
  });

  it('rejects an item missing a required field', () => {
    const { sql: _sql, ...missingSql } = VALID_CASE;
    expect(isValidProposedTestCase(missingSql)).toBe(false);
  });

  it('rejects an invalid category', () => {
    expect(isValidProposedTestCase({ ...VALID_CASE, category: 'NOT_A_CATEGORY' })).toBe(false);
  });

  it('rejects an invalid priority', () => {
    expect(isValidProposedTestCase({ ...VALID_CASE, priority: 'P9' })).toBe(false);
  });

  it('rejects wrong-typed fields (steps not an array)', () => {
    expect(isValidProposedTestCase({ ...VALID_CASE, steps: 'not an array' })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isValidProposedTestCase(null)).toBe(false);
    expect(isValidProposedTestCase('a string')).toBe(false);
  });
});

describe('generateTestCasesFromPrompt', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const request = { prompt: 'add a check', targetTables: ['orders'], knownFieldsByTable: { orders: ['id'] } };

  it('filters out invalid items from a mixed valid/invalid response, returning usage', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        testCases: [VALID_CASE, { name: 'bad, missing fields' }],
        usage: { inputTokens: 120, outputTokens: 340 },
      }),
    } as Response);

    const result = await generateTestCasesFromPrompt('http://localhost:8787', request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.testCases).toHaveLength(1);
      expect(result.testCases[0].name).toBe('Check X');
      expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 340 });
    }
  });

  it('returns the server error message on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'AI test case generation request failed' }),
    } as Response);

    const result = await generateTestCasesFromPrompt('http://localhost:8787', request);
    expect(result).toEqual({ ok: false, error: 'AI test case generation request failed' });
  });

  it('falls back to a generic message when a non-ok response has no error body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    const result = await generateTestCasesFromPrompt('http://localhost:8787', request);
    expect(result).toEqual({ ok: false, error: 'Server responded 500' });
  });

  it('catches a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'));

    const result = await generateTestCasesFromPrompt('http://localhost:8787', request);
    expect(result).toEqual({ ok: false, error: 'fetch failed' });
  });

  it('rejects an unexpected response shape (testCases not an array)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ notTestCases: [] }),
    } as Response);

    const result = await generateTestCasesFromPrompt('http://localhost:8787', request);
    expect(result).toEqual({ ok: false, error: 'Unexpected response shape from AI Assist server' });
  });
});
