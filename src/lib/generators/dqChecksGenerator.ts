import type { GeneratorContext } from '@/lib/generators/types';
import { nextDraftId } from '@/lib/generators/types';
import type { TestCase } from '@/types/testCase';
import type { MappingRow, JoinFilterRow } from '@/types/mapping';
import { qualifiedTable, quoteColumn } from '@/lib/sql/identifierQuoting';
import { normalizeTableName } from '@/lib/excel/normalizeTableName';
import { isCdeIdentifier } from '@/lib/cde';
import { classifyDatatype } from '@/lib/datatype';
import { getTableTypeConfig } from '@/types/tableTypeConfig';
import { resolveTargetReference } from '@/lib/sql/sourceReference';
import { isEtlSystemField } from '@/lib/etlSystemFields';

const EMAIL_PATTERN = /email/i;
const PHONE_PATTERN = /phone|mobile|contact_no|tel/i;
const DATE_NAME_PATTERN = /date|_dt$|dob/i;
// Note: deliberately excludes "_code" -- in practice a "_code" suffix is just as often a
// classification/status code (e.g. "source_system_code", "data_quality_check_code") that's
// expected to repeat across many rows, as it is a genuinely unique identifier. Only "_id"/"_key"
// are reliable enough to assume uniqueness from the name alone.
const ID_SUFFIX_PATTERN = /_id$|_key$/i;
// Field names that merely contain "email"/"phone" as a substring but are actually a count/measure
// of them (e.g. "valid_email_address_count") -- not a field that itself stores an email/phone string.
const MEASURE_NAME_EXCLUDE = /count$|_pct$|percent|_num(ber)?$|_amount$|_total$|_qty$|quantity$|_rate$|ratio$/i;

/** True only when the field plausibly *stores* an email/phone value -- not a count/measure of them, and not a numeric column. */
function isTextFormatCandidate(row: MappingRow, pattern: RegExp): boolean {
  if (!pattern.test(row.targetField)) return false;
  if (MEASURE_NAME_EXCLUDE.test(row.targetField)) return false;
  const datatype = row.targetDatatype || row.sourceDatatype;
  if (datatype && classifyDatatype(datatype) === 'numeric') return false;
  return true;
}

function substituteTableAliases(condition: string, childTable: string, otherTable: string): string {
  const escapedChild = childTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedOther = otherTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return condition
    .replace(new RegExp(`\\b${escapedChild}\\.`, 'gi'), 'c.')
    .replace(new RegExp(`\\b${escapedOther}\\.`, 'gi'), 'p.');
}

export function generateDqChecks(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    const typeConfig = getTableTypeConfig(ctx.tableTypeConfigs, targetTable);
    if (typeConfig.targetKind === 'dashboard') continue; // no queryable target to check

    const targetSchema = rows.find((r) => r.targetSchema)?.targetSchema;
    const qualified = resolveTargetReference(typeConfig, targetSchema, targetTable);

    for (const row of rows) {
      if (!row.targetField) continue;
      // ETL/audit columns (etl_timestamp, load_date, batch_id, ...) are infrastructure-populated;
      // format/duplicate heuristics on them are noise, not signal.
      if (isEtlSystemField(row.targetField)) continue;
      const col = quoteColumn(row.targetField);
      const isDateType = row.targetDatatype && /date|timestamp/i.test(row.targetDatatype);

      if (isTextFormatCandidate(row, EMAIL_PATTERN)) {
        testCases.push({
          id: nextDraftId(),
          name: `DQ Check (email format): ${targetTable}.${row.targetField}`,
          category: 'DQ_CHECKS',
          priority: 'P2',
          description: `Confirms values in ${row.targetField} conform to a valid email address format.`,
          steps: ['Run the format-validation query.', 'Confirm invalid_email_count is 0.'],
          expectedResult: 'invalid_email_count is 0 for all non-null values.',
          sql: `SELECT COUNT(*) AS invalid_email_count\nFROM ${qualified}\nWHERE ${col} IS NOT NULL\n  AND NOT ${col} RLIKE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,}$';`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }

      if (isTextFormatCandidate(row, PHONE_PATTERN)) {
        testCases.push({
          id: nextDraftId(),
          name: `DQ Check (phone format): ${targetTable}.${row.targetField}`,
          category: 'DQ_CHECKS',
          priority: 'P2',
          description: `Confirms values in ${row.targetField} conform to a plausible phone number format.`,
          steps: ['Run the format-validation query.', 'Confirm invalid_phone_count is 0 (adjust the pattern to your expected format).'],
          expectedResult: 'invalid_phone_count is 0 for all non-null values.',
          sql: `SELECT COUNT(*) AS invalid_phone_count\nFROM ${qualified}\nWHERE ${col} IS NOT NULL\n  AND NOT ${col} RLIKE '^[+]?[0-9()\\\\-\\\\s]{7,15}$';`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }

      if (DATE_NAME_PATTERN.test(row.targetField) && !isDateType) {
        testCases.push({
          id: nextDraftId(),
          name: `DQ Check (date format): ${targetTable}.${row.targetField}`,
          category: 'DQ_CHECKS',
          priority: 'P2',
          description: `${row.targetField} looks like a date field but is stored as ${row.targetDatatype || 'a non-date type'}; confirms values still parse as valid dates.`,
          steps: ['Run the parse-validation query.', 'Confirm unparseable_date_count is 0 (adjust the format mask to the actual source format).'],
          expectedResult: 'unparseable_date_count is 0 for all non-null values.',
          sql: `SELECT COUNT(*) AS unparseable_date_count\nFROM ${qualified}\nWHERE ${col} IS NOT NULL\n  AND TO_DATE(${col}, 'yyyy-MM-dd') IS NULL;`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }

      if (ID_SUFFIX_PATTERN.test(row.targetField) && !row.isPrimaryKey) {
        testCases.push({
          id: nextDraftId(),
          name: `DQ Check (duplicate values): ${targetTable}.${row.targetField}`,
          category: 'DQ_CHECKS',
          priority: 'P2',
          description: `${row.targetField} looks like an identifier/code/key field; confirms it has no unexpected duplicates in ${targetTable}.`,
          steps: ['Run the duplicate-detection query.', 'Review any returned values.'],
          expectedResult: 'Zero rows returned, unless duplicates are expected for this field (e.g. a non-unique foreign key).',
          sql: `SELECT ${col}, COUNT(*) AS dup_count\nFROM ${qualified}\nGROUP BY ${col}\nHAVING COUNT(*) > 1;`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }
    }

    const anyPk = rows.some((r) => r.isPrimaryKey);
    if (!anyPk) {
      const allFields = rows.filter((r) => r.targetField).map((r) => r.targetField);
      if (allFields.length > 0) {
        const columnList = allFields.map(quoteColumn).join(', ');
        testCases.push({
          id: nextDraftId(),
          name: `DQ Check (whole-row duplicates): ${targetTable}`,
          category: 'DQ_CHECKS',
          priority: 'P1',
          description: `No primary key is flagged for ${targetTable} in the mapping document; confirms there are no fully duplicated rows.`,
          steps: ['Run the GROUP BY across all mapped columns.', 'Confirm no group has a count greater than 1.'],
          expectedResult: 'Zero rows returned.',
          sql: `SELECT ${columnList}, COUNT(*) AS dup_count\nFROM ${qualified}\nGROUP BY ${columnList}\nHAVING COUNT(*) > 1;`,
          targetTable,
          sourceMappingRowIds: rows.map((r) => r.id),
        });
      }

      // CDE safety net: with no formal PK, identifier-like Critical Data Elements not already
      // caught by ID_SUFFIX_PATTERN above (e.g. bare "id", "account_number", "ssn") still get
      // their own targeted uniqueness check rather than relying solely on the whole-row check.
      for (const row of rows) {
        if (!row.targetField || ID_SUFFIX_PATTERN.test(row.targetField) || !isCdeIdentifier(row.targetField)) continue;
        const col = quoteColumn(row.targetField);
        testCases.push({
          id: nextDraftId(),
          name: `CDE Uniqueness Check: ${targetTable}.${row.targetField}`,
          category: 'DQ_CHECKS',
          priority: 'P1',
          isCde: true,
          description: `No primary key is flagged for ${targetTable}; ${row.targetField} is a Critical Data Element expected to be unique — confirms no unexpected duplicates.`,
          steps: ['Run the duplicate-detection query.', 'Review any returned values.'],
          expectedResult: 'Zero rows returned, unless duplicates are an approved exception for this field.',
          sql: `SELECT ${col}, COUNT(*) AS dup_count\nFROM ${qualified}\nGROUP BY ${col}\nHAVING COUNT(*) > 1;`,
          targetTable,
          sourceMappingRowIds: [row.id],
        });
      }
    }
  }

  // Referential integrity: run once globally over the distinct join rows, not once per target
  // table. A join touches two tables, and `joinsForTable` returns it for either one -- looping
  // per target table previously generated the check twice whenever *both* sides were themselves
  // target tables, once correctly and once with the relationship backwards (see below).
  testCases.push(...buildReferentialIntegrityChecks(ctx));

  return testCases;
}

function buildReferentialIntegrityChecks(ctx: GeneratorContext): TestCase[] {
  const testCases: TestCase[] = [];

  const allJoins = new Set<JoinFilterRow>();
  for (const rows of ctx.joinIndex.joinsByTable.values()) {
    for (const row of rows) allJoins.add(row);
  }

  const targetByNormalizedName = new Map<string, { targetTable: string; rows: MappingRow[] }>();
  for (const [targetTable, rows] of ctx.mappingRowsByTargetTable) {
    targetByNormalizedName.set(normalizeTableName(targetTable), { targetTable, rows });
  }

  for (const join of allJoins) {
    if (!join.joinCondition) continue;

    // The joins sheet's own "Table" column names the table THIS join was documented for -- i.e.
    // the table doing the joining out to a lookup/parent table. Treat that as the child
    // (FK-holding) side and the other table in the pair as the referenced parent. Trusting this
    // column (rather than whichever table the outer loop happened to be iterating) is what makes
    // the direction deterministic and prevents generating the same relationship from both ends.
    const childEntry = targetByNormalizedName.get(normalizeTableName(join.tableName));
    if (!childEntry) continue; // child isn't one of our own target tables -- no schema to check it against
    const { targetTable: childTable, rows: childRows } = childEntry;

    if (getTableTypeConfig(ctx.tableTypeConfigs, childTable).targetKind !== 'table') continue;

    const normalizedChild = normalizeTableName(childTable);
    const otherTable = join.tablesInvolved.find((t) => normalizeTableName(t) !== normalizedChild);
    if (!otherTable) continue;

    const childSchema = childRows.find((r) => r.targetSchema)?.targetSchema;
    const qualifiedChild = qualifiedTable(childSchema, childTable);

    const aliasedCondition = substituteTableAliases(join.joinCondition, childTable, otherTable);
    const parentColMatch = aliasedCondition.match(/p\.(\w+)/);
    if (!parentColMatch) continue;
    const parentCol = parentColMatch[1];
    const childColMatch = aliasedCondition.match(/c\.(\w+)/);
    const childCol = childColMatch ? childColMatch[1] : null;

    const sql = [
      `SELECT COUNT(*) AS orphan_count`,
      `FROM ${qualifiedChild} c`,
      `LEFT JOIN ${quoteColumn(otherTable)} p ON ${aliasedCondition}`,
      `WHERE p.${parentCol} IS NULL${childCol ? ` AND c.${childCol} IS NOT NULL` : ''};`,
    ].join('\n');

    testCases.push({
      id: nextDraftId(),
      name: `DQ Check (referential integrity): ${childTable} -> ${otherTable}`,
      category: 'DQ_CHECKS',
      priority: 'P1',
      description: `Confirms every ${childTable} row referencing ${otherTable} (per the documented join condition) has a matching parent record — no orphaned foreign keys.`,
      steps: [
        `Run the LEFT JOIN orphan-check query (${childTable} is the referencing/child side per the joins sheet; ${otherTable} is the referenced parent).`,
        'Confirm orphan_count is 0.',
      ],
      expectedResult: 'orphan_count is 0 — every referenced parent row exists.',
      sql,
      targetTable: childTable,
      sourceMappingRowIds: childRows.map((r) => r.id),
    });
  }

  return testCases;
}
