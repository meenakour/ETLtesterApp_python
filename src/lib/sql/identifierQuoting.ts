function quoteIdentifierPart(part: string): string {
  const trimmed = part.trim();
  if (!trimmed) return trimmed;
  return `\`${trimmed.replace(/`/g, '``')}\``;
}

export function qualifiedTable(schema: string | undefined, table: string): string {
  const tablePart = quoteIdentifierPart(table || 'unknown_table');
  if (schema && schema.trim()) {
    return `${quoteIdentifierPart(schema)}.${tablePart}`;
  }
  return tablePart;
}

export function qualifiedColumn(alias: string, field: string): string {
  return `${alias}.\`${field.replace(/`/g, '``')}\``;
}

export function quoteColumn(field: string): string {
  return `\`${field.replace(/`/g, '``')}\``;
}
