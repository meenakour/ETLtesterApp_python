export function normalizeTableName(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = raw.trim().toLowerCase();
  text = text.replace(/[`"[\]]/g, '');
  const parts = text.split('.');
  text = parts[parts.length - 1];
  return text.trim();
}
