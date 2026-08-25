import { describe, expect, it } from 'vitest';
import { generateRowCountTests } from '@/lib/generators/rowCountGenerator';
import { makeMappingRow, buildContext, makeJoin } from '@/lib/generators/testHelpers';
import { DEFAULT_TABLE_TYPE_CONFIG } from '@/types/tableTypeConfig';

describe('generateRowCountTests', () => {
  it('generates a normal table-to-table row count reconciliation by default', () => {
    const rows = [makeMappingRow({ sourceTable: 'orders_raw', targetTable: 'orders', targetSchema: 'curated' })];
    const testCases = generateRowCountTests(buildContext(rows));
    expect(testCases).toHaveLength(1);
    expect(testCases[0].sql).toContain('`orders_raw`');
    expect(testCases[0].sql).toContain('`curated`.`orders`');
  });

  it('regression: skips a target-table group configured as a dashboard (row count does not apply to a KPI)', () => {
    const rows = [makeMappingRow({ sourceTable: 'orders_raw', targetTable: 'revenue_kpi' })];
    const config = { ...DEFAULT_TABLE_TYPE_CONFIG, targetKind: 'dashboard' as const };
    const testCases = generateRowCountTests(buildContext(rows, [], { revenue_kpi: config }));
    expect(testCases).toEqual([]);
  });

  it('uses a file-qualified source reference when sourceKind is file, with no join/filter attached', () => {
    const rows = [
      makeMappingRow({
        sourceTable: 'customers',
        sourceFileLocation: '/mnt/landing',
        sourceFileName: 'customers.csv',
        targetTable: 'customers',
        targetSchema: 'curated',
      }),
    ];
    const config = { ...DEFAULT_TABLE_TYPE_CONFIG, sourceKind: 'file' as const };
    const testCases = generateRowCountTests(buildContext(rows, [], { customers: config }));
    expect(testCases).toHaveLength(1);
    expect(testCases[0].sql).toContain('csv.`/mnt/landing/customers.csv`');
  });

  it('regression: generates exactly one row-count case per target table even when several fields are pulled in via joined lookup tables', () => {
    // "orders" is fed mainly by orders_raw, plus one field each from three joined lookup tables --
    // previously every distinct source table got its own (spurious) row-count reconciliation case.
    const rows = [
      makeMappingRow({ sourceTable: 'orders_raw', sourceField: 'order_id', targetTable: 'orders', targetField: 'order_id' }),
      makeMappingRow({ sourceTable: 'orders_raw', sourceField: 'order_date', targetTable: 'orders', targetField: 'order_date' }),
      makeMappingRow({ sourceTable: 'orders_raw', sourceField: 'amount', targetTable: 'orders', targetField: 'amount' }),
      makeMappingRow({ sourceTable: 'customers', sourceField: 'name', targetTable: 'orders', targetField: 'customer_name' }),
      makeMappingRow({ sourceTable: 'products', sourceField: 'name', targetTable: 'orders', targetField: 'product_name' }),
      makeMappingRow({ sourceTable: 'warehouses', sourceField: 'code', targetTable: 'orders', targetField: 'warehouse_code' }),
    ];
    const testCases = generateRowCountTests(buildContext(rows));
    expect(testCases).toHaveLength(1);
    expect(testCases[0].name).toBe('Row Count Reconciliation: orders_raw -> orders');
  });

  it('regression: never attaches a join documented for a different table (no fabricated self-join or wrong-table join)', () => {
    // Source/target share the "orders" name, so the join sheet's own conditions attach directly.
    const rows = [
      makeMappingRow({ sourceTable: 'orders', sourceField: 'order_id', targetTable: 'orders', targetField: 'order_id' }),
    ];
    const joins = [
      makeJoin({ tableName: 'orders', joinCondition: 'orders.customer_id = customers.customer_id', tablesInvolved: ['orders', 'customers'] }),
      // Documented for an unrelated table pair -- must never be attached to the "orders" query.
      makeJoin({ tableName: 'invoices', joinCondition: 'invoices.id = invoice_lines.invoice_id', tablesInvolved: ['invoices', 'invoice_lines'] }),
    ];
    const testCases = generateRowCountTests(buildContext(rows, joins));
    expect(testCases).toHaveLength(1);
    const sql = testCases[0].sql;
    expect(sql).toContain('JOIN `customers` ON orders.customer_id = customers.customer_id');
    expect(sql).not.toContain('invoice');
    expect(sql).not.toContain('JOIN `orders` ON'); // no self-join
  });
});
