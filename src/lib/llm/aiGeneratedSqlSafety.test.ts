import { describe, expect, it } from 'vitest';
import { isSafeGeneratedSql } from '@/lib/llm/aiGeneratedSqlSafety';

describe('isSafeGeneratedSql', () => {
  it('accepts a realistic multi-line SELECT with JOIN/WHERE/GROUP BY -- the key behavioral', () => {
    // difference from the whitelist-based isSafeSqlExpression, which would reject this shape
    // outright for containing SELECT/FROM/JOIN at all.
    const sql = `SELECT o.customer_id, COUNT(*) AS order_count
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'ACTIVE'
GROUP BY o.customer_id
ORDER BY order_count DESC;`;
    expect(isSafeGeneratedSql(sql)).toBe(true);
  });

  it('rejects DROP statements', () => {
    expect(isSafeGeneratedSql('DROP TABLE orders;')).toBe(false);
  });

  it('rejects DELETE statements', () => {
    expect(isSafeGeneratedSql("DELETE FROM orders WHERE id = 1;")).toBe(false);
  });

  it('rejects statement-stacking after a semicolon', () => {
    expect(isSafeGeneratedSql('SELECT 1; DROP TABLE orders;')).toBe(false);
  });

  it('allows a single trailing semicolon with nothing after it', () => {
    expect(isSafeGeneratedSql('SELECT COUNT(*) FROM orders;')).toBe(true);
  });

  it('rejects empty or whitespace-only SQL', () => {
    expect(isSafeGeneratedSql('')).toBe(false);
    expect(isSafeGeneratedSql('   ')).toBe(false);
  });

  it('rejects SQL exceeding the length cap', () => {
    expect(isSafeGeneratedSql('SELECT ' + 'x'.repeat(4000))).toBe(false);
  });

  it('does not false-positive on a column/table name that merely contains a blocked keyword as a substring', () => {
    // "updated_at" contains "UPDATE" as a substring but is not the keyword itself.
    expect(isSafeGeneratedSql('SELECT updated_at FROM orders;')).toBe(true);
  });
});
