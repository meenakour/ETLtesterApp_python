import * as XLSX from 'xlsx';

export const MAPPING_HEADERS = [
  'Source Table',
  'Source Schema',
  'Source Field',
  'Target Table',
  'Target Schema',
  'Target Field',
  'Source Datatype',
  'Target Datatype',
  'Transformation Logic',
  'Primary Key',
  'Nullable',
];

const MAPPING_ROWS: (string | number)[][] = [
  ['customers', 'raw', 'customer_id', 'customers', 'curated', 'customer_id', 'INT', 'INT', '', 'Y', 'N'],
  [
    'customers',
    'raw',
    'first_name',
    'customers',
    'curated',
    'full_name',
    'VARCHAR(50)',
    'VARCHAR(100)',
    "CONCAT(first_name, ' ', last_name)",
    'N',
    'Y',
  ],
  [
    'customers',
    'raw',
    'last_name',
    'customers',
    'curated',
    'full_name',
    'VARCHAR(50)',
    'VARCHAR(100)',
    "CONCAT(first_name, ' ', last_name)",
    'N',
    'Y',
  ],
  ['customers', 'raw', 'email', 'customers', 'curated', 'email', 'VARCHAR(100)', 'VARCHAR(100)', '', 'N', 'Y'],
  [
    'customers',
    'raw',
    'signup_date',
    'customers',
    'curated',
    'signup_date',
    'STRING',
    'DATE',
    'CAST(signup_date AS DATE)',
    'N',
    'N',
  ],
  [
    'customers',
    'raw',
    'status',
    'customers',
    'curated',
    'status_flag',
    'VARCHAR(1)',
    'VARCHAR(10)',
    "IF status = 'A' THEN 'ACTIVE' ELSE 'INACTIVE'",
    'N',
    'N',
  ],
  ['orders', 'raw', 'order_id', 'orders', 'curated', 'order_id', 'INT', 'INT', '', 'Y', 'N'],
  ['orders', 'raw', 'customer_id', 'orders', 'curated', 'customer_id', 'INT', 'INT', '', 'N', 'N'],
  [
    'orders',
    'raw',
    'amount',
    'orders',
    'curated',
    'order_amount',
    'DECIMAL(10,4)',
    'DECIMAL(10,2)',
    'ROUND(amount, 2)',
    'N',
    'N',
  ],
];

export const JOIN_HEADERS = ['Table', 'Schema', 'Join Type', 'Join Condition', 'Tables Involved', 'Filter Condition'];

const JOIN_ROWS: (string | number)[][] = [
  [
    'orders',
    '',
    'INNER',
    'orders.customer_id = customers.customer_id',
    'orders, customers',
    "orders.order_date >= '2020-01-01'",
  ],
  ['customers', '', '', '', 'customers', "customers.status <> 'DELETED'"],
];

/**
 * Generates and downloads a two-sheet example mapping workbook (Mapping + Joins and Filters)
 * using this app's own canonical header names, so a new user can see the expected shape without
 * needing a real mapping document handy.
 */
export function downloadSampleTemplate(filename = 'sample_mapping_template.xlsx'): void {
  const wb = XLSX.utils.book_new();

  const mappingSheet = XLSX.utils.aoa_to_sheet([MAPPING_HEADERS, ...MAPPING_ROWS]);
  mappingSheet['!cols'] = MAPPING_HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, mappingSheet, 'Mapping');

  const joinSheet = XLSX.utils.aoa_to_sheet([JOIN_HEADERS, ...JOIN_ROWS]);
  joinSheet['!cols'] = JOIN_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, joinSheet, 'Joins and Filters');

  XLSX.writeFile(wb, filename);
}
