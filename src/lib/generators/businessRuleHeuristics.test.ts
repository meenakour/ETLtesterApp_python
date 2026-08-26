import { describe, expect, it } from 'vitest';
import { classifyTransformation, qualifyFieldReferences } from '@/lib/generators/businessRuleHeuristics';

const KNOWN_FIELDS = ['first_name', 'last_name', 'status', 'signup_date', 'amount', 'discount', 'list_price'];

describe('classifyTransformation', () => {
  it('treats blank or trivial sentinels as DIRECT_COPY', () => {
    expect(classifyTransformation('', KNOWN_FIELDS).strategy).toBe('DIRECT_COPY');
    expect(classifyTransformation('Same as source', KNOWN_FIELDS).strategy).toBe('DIRECT_COPY');
    expect(classifyTransformation('Direct Map', KNOWN_FIELDS).strategy).toBe('DIRECT_COPY');
    expect(classifyTransformation('N/A', KNOWN_FIELDS).strategy).toBe('DIRECT_COPY');
  });

  it('classifies a well-formed CASE WHEN expression as CASE_EXPRESSION', () => {
    const result = classifyTransformation("CASE WHEN status = 'A' THEN 'ACTIVE' ELSE 'INACTIVE' END", KNOWN_FIELDS);
    expect(result.strategy).toBe('CASE_EXPRESSION');
    expect(result.expression).toContain('CASE WHEN');
  });

  it('rewrites informal IF...THEN...ELSE into a CASE expression', () => {
    const result = classifyTransformation("IF status = 'A' THEN 'ACTIVE' ELSE 'INACTIVE'", KNOWN_FIELDS);
    expect(result.strategy).toBe('CASE_EXPRESSION');
    expect(result.expression).toBe("CASE WHEN status = 'A' THEN 'ACTIVE' ELSE 'INACTIVE' END");
  });

  it('regression: a bare TRUE/FALSE boolean literal in a CASE expression is recognized as a keyword, not rejected as an unknown token', () => {
    const result = classifyTransformation("CASE WHEN active_flag = true THEN 'A' ELSE 'B' END", [...KNOWN_FIELDS, 'active_flag']);
    expect(result.strategy).toBe('CASE_EXPRESSION');
  });

  it('classifies CONCAT(...) verbatim as CONCAT_EXPRESSION', () => {
    const result = classifyTransformation("CONCAT(first_name, ' ', last_name)", KNOWN_FIELDS);
    expect(result.strategy).toBe('CONCAT_EXPRESSION');
    expect(result.expression).toBe("CONCAT(first_name, ' ', last_name)");
  });

  it('rewrites a || concatenation shape into CONCAT(...)', () => {
    const result = classifyTransformation('first_name || last_name', KNOWN_FIELDS);
    expect(result.strategy).toBe('CONCAT_EXPRESSION');
    expect(result.expression).toBe('CONCAT(first_name, last_name)');
  });

  it('classifies CAST(expr AS <TYPE>) as DIRECT_SQL_FUNCTION (regression: type keywords must be whitelisted)', () => {
    const result = classifyTransformation('CAST(signup_date AS DATE)', KNOWN_FIELDS);
    expect(result.strategy).toBe('DIRECT_SQL_FUNCTION');
    expect(result.expression).toBe('CAST(signup_date AS DATE)');
  });

  it('classifies ROUND(...) as DIRECT_SQL_FUNCTION', () => {
    const result = classifyTransformation('ROUND(amount, 2)', KNOWN_FIELDS);
    expect(result.strategy).toBe('DIRECT_SQL_FUNCTION');
  });

  it('classifies "defaults to" phrasing as a COALESCE DEFAULT_OR_LOOKUP expression', () => {
    const result = classifyTransformation('discount defaults to 0', KNOWN_FIELDS);
    expect(result.strategy).toBe('DEFAULT_OR_LOOKUP');
    expect(result.expression).toBe('COALESCE(discount, 0)');
  });

  it('classifies a pure arithmetic expression as ARITHMETIC_EXPRESSION', () => {
    const result = classifyTransformation('amount * 1.1', KNOWN_FIELDS);
    expect(result.strategy).toBe('ARITHMETIC_EXPRESSION');
    expect(result.expression).toBe('amount * 1.1');
  });

  it('falls back to MANUAL_REVIEW for natural-language business rules rather than guessing', () => {
    const result = classifyTransformation("per business team's custom rule engine, see wiki", KNOWN_FIELDS);
    expect(result.strategy).toBe('MANUAL_REVIEW');
    expect(result.expression).toBeNull();
  });

  it('falls back to MANUAL_REVIEW when a CASE-like expression references an unknown identifier (token whitelist gate)', () => {
    // "lookup_table" is not a known field, core keyword, or whitelisted function -- must not be
    // silently trusted as valid SQL.
    const result = classifyTransformation('CASE WHEN status = lookup_table.code THEN 1 ELSE 0 END', KNOWN_FIELDS);
    expect(result.strategy).toBe('MANUAL_REVIEW');
  });

  it('falls back to MANUAL_REVIEW for unbalanced parentheses', () => {
    const result = classifyTransformation('CONCAT(first_name, last_name', KNOWN_FIELDS);
    expect(result.strategy).toBe('MANUAL_REVIEW');
  });

  it('regression: SUM/AVG/COUNT/MIN/MAX fall back to MANUAL_REVIEW by default (row-level context)', () => {
    // Without allowAggregates, a bare aggregate has no valid meaning in a per-row correlated
    // comparison -- row-level generators (transformation validation, business rules) must never
    // silently treat it as a normal function call.
    expect(classifyTransformation('SUM(amount)', KNOWN_FIELDS).strategy).toBe('MANUAL_REVIEW');
  });

  it('regression: SUM/AVG/COUNT/MIN/MAX classify as DIRECT_SQL_FUNCTION when allowAggregates is set (dashboard-KPI context)', () => {
    const result = classifyTransformation('SUM(amount)', KNOWN_FIELDS, { allowAggregates: true });
    expect(result.strategy).toBe('DIRECT_SQL_FUNCTION');
    expect(result.expression).toBe('SUM(amount)');

    expect(classifyTransformation('AVG(amount)', KNOWN_FIELDS, { allowAggregates: true }).strategy).toBe(
      'DIRECT_SQL_FUNCTION'
    );
    expect(classifyTransformation('COUNT(amount)', KNOWN_FIELDS, { allowAggregates: true }).strategy).toBe(
      'DIRECT_SQL_FUNCTION'
    );
  });
});

describe('qualifyFieldReferences', () => {
  it('qualifies bare field-name tokens with the given alias', () => {
    const result = qualifyFieldReferences("CONCAT(first_name, ' ', last_name)", ['first_name', 'last_name'], 's');
    expect(result).toBe("CONCAT(s.`first_name`, ' ', s.`last_name`)");
  });

  it('does not touch string literal contents', () => {
    const result = qualifyFieldReferences("CASE WHEN status = 'first_name' THEN 1 END", ['first_name', 'status'], 's');
    // the field reference to `status` outside the literal is qualified...
    expect(result).toContain('s.`status`');
    // ...but the literal string 'first_name' is left alone
    expect(result).toContain("'first_name'");
    expect(result).not.toContain("s.`first_name`'");
  });
});
