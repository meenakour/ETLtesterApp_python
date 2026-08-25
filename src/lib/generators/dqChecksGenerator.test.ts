import { describe, expect, it } from 'vitest';
import { generateDqChecks } from '@/lib/generators/dqChecksGenerator';
import { makeMappingRow, buildContext, makeJoin } from '@/lib/generators/testHelpers';

describe('generateDqChecks referential integrity', () => {
  it('regression: generates the check exactly once, in the correct direction, when both sides of a join are target tables', () => {
    // The joins sheet documents this under Table=orders (orders is the referencing/child side --
    // it's the one with the customer_id foreign key). Previously the generator ran once per
    // target-table iteration, producing the check *twice* -- once correctly (orders -> customers)
    // and once backwards (customers -> orders, which would flag every customer with zero orders
    // as a false-positive "orphan").
    const rows = [
      makeMappingRow({ targetTable: 'orders', targetField: 'order_id', isPrimaryKey: true }),
      makeMappingRow({ targetTable: 'orders', targetField: 'customer_id' }),
      makeMappingRow({ targetTable: 'customers', targetField: 'customer_id', isPrimaryKey: true }),
      makeMappingRow({ targetTable: 'customers', targetField: 'name' }),
    ];
    const joins = [
      makeJoin({
        tableName: 'orders',
        joinCondition: 'orders.customer_id = customers.customer_id',
        tablesInvolved: ['orders', 'customers'],
      }),
    ];
    const testCases = generateDqChecks(buildContext(rows, joins));
    const refIntegrityCases = testCases.filter((tc) => tc.name.includes('referential integrity'));

    expect(refIntegrityCases).toHaveLength(1);
    expect(refIntegrityCases[0].name).toBe('DQ Check (referential integrity): orders -> customers');
    expect(refIntegrityCases[0].sql).toContain('FROM `orders` c');
    expect(refIntegrityCases[0].sql).toContain('LEFT JOIN `customers` p');
  });

  it('skips a join whose "Table" column names a table we have no mapping data for (no schema to check it against)', () => {
    const rows = [makeMappingRow({ targetTable: 'orders', targetField: 'order_id', isPrimaryKey: true })];
    const joins = [
      makeJoin({
        tableName: 'some_other_table_not_in_mapping_doc',
        joinCondition: 'some_other_table_not_in_mapping_doc.id = orders.id',
        tablesInvolved: ['some_other_table_not_in_mapping_doc', 'orders'],
      }),
    ];
    const testCases = generateDqChecks(buildContext(rows, joins));
    expect(testCases.some((tc) => tc.name.includes('referential integrity'))).toBe(false);
  });
});
