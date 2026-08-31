import { describe, expect, it } from 'vitest';
import { generateEdgeCaseTests } from '@/lib/generators/edgeCaseGenerator';
import { generatePkNullUniquenessTests } from '@/lib/generators/pkNullUniquenessGenerator';
import { makeMappingRow, buildContext } from '@/lib/generators/testHelpers';

describe('generateEdgeCaseTests', () => {
  it('regression: includes the null-dates check for a NULLABLE date field', () => {
    const row = makeMappingRow({ targetTable: 't', targetField: 'signup_date', targetDatatype: 'DATE', isNullable: true });
    const ctx = buildContext([row]);
    const [tc] = generateEdgeCaseTests(ctx);
    expect(tc.sql).toContain('null_date_count');
    expect(tc.sql).toContain('future_date_count');
    expect(tc.sql).toContain('sentinel_date_count');
  });

  it('regression: omits the null-dates check for a NOT NULL date field -- already asserted by PK_NULL_UNIQUENESS\'s own NOT NULL Validation case for the same field, so repeating it here was a pure duplicate', () => {
    const row = makeMappingRow({ targetTable: 't', targetField: 'signup_date', targetDatatype: 'DATE', isNullable: false });
    const ctx = buildContext([row]);
    const [tc] = generateEdgeCaseTests(ctx);
    expect(tc.sql).not.toContain('null_date_count');
    // the other two date sub-checks are unrelated to nullability and must still be present
    expect(tc.sql).toContain('future_date_count');
    expect(tc.sql).toContain('sentinel_date_count');
  });

  it('regression: never emits the non-actionable "zero values" numeric check', () => {
    const nullable = makeMappingRow({ targetTable: 't', targetField: 'amount', targetDatatype: 'DECIMAL(10,2)', isNullable: true });
    const notNullable = makeMappingRow({ targetTable: 't', targetField: 'amount2', targetDatatype: 'DECIMAL(10,2)', isNullable: false });
    const ctx = buildContext([nullable, notNullable]);
    const cases = generateEdgeCaseTests(ctx);
    for (const tc of cases) {
      expect(tc.sql).not.toContain('zero_value_count');
    }
    // negative-values and precision-overflow checks are unrelated and must still be present
    expect(cases[0].sql).toContain('negative_value_count');
    expect(cases[0].sql).toContain('precision_overflow_count');
  });

  it('regression: never emits the generic hardcoded boolean "invalid domain" check, but keeps the value-domain check', () => {
    const row = makeMappingRow({ targetTable: 't', targetField: 'is_active', targetDatatype: 'BOOLEAN' });
    const ctx = buildContext([row]);
    const [tc] = generateEdgeCaseTests(ctx);
    expect(tc.sql).not.toContain('invalid_flag_count');
    expect(tc.sql).toContain('SELECT DISTINCT');
  });
});

describe('cross-check: no duplication between EDGE_CASE_DATATYPE and PK_NULL_UNIQUENESS', () => {
  it('a NOT NULL date field\'s NULL count is asserted exactly once, by PK_NULL_UNIQUENESS, not by the edge-case generator', () => {
    const row = makeMappingRow({ targetTable: 't', targetField: 'signup_date', targetDatatype: 'DATE', isNullable: false });
    const ctx = buildContext([row]);

    const edgeCases = generateEdgeCaseTests(ctx);
    expect(edgeCases[0].sql).not.toContain('null_date_count');

    const pkNullCases = generatePkNullUniquenessTests(ctx);
    const notNullCase = pkNullCases.find((tc) => tc.name.startsWith('NOT NULL Validation'));
    expect(notNullCase?.sql).toContain('signup_date');
  });
});
